import { useEffect, useState, useRef } from 'react'
import { X, CheckCircle, RefreshCw, AlertTriangle, Layers, Cloud, Wifi, Trash2, Download, Monitor } from 'lucide-react'
import { factoryApi } from '../services/api'
import type { LineModelOption, ApplyModelRequest } from '../types'
import { LoadingOverlay } from './LoadingOverlay'
import { Toast } from './Toast'
import { ConfirmModal } from './ConfirmModal'
import { OfflineAlertModal } from './OfflineAlertModal'
// 1. ADD IMPORT
import { useSearchParams } from 'react-router-dom'

interface Props {
    lineNumber: number
    version?: string
    onClose: () => void
    onOperationComplete?: () => void
}

export default function LineModelManagerModal({ lineNumber, version, onClose, onOperationComplete }: Props) {
    // 2. URL STATE MANAGEMENT
    const [searchParams, setSearchParams] = useSearchParams();

    // We check for 'sub' param to show nested modals.
    // Dashboard handles the main 'manageLine' param.
    const activeSubModal = searchParams.get('sub'); // 'confirm_deploy', 'confirm_delete', 'offline_alert'
    const isDownloadSelect = searchParams.get('mode') === 'download_select';

    const [loading, setLoading] = useState(true)
    const [models, setModels] = useState<LineModelOption[]>([])
    const [selectedModel, setSelectedModel] = useState<string>('')

    // Action state
    const [isApplying, setIsApplying] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [forceOverwrite, setForceOverwrite] = useState(false)

    // Offline Alert State
    const [offlineCandidates, setOfflineCandidates] = useState<any[]>([])
    const [currentDeploymentCandidates, setCurrentDeploymentCandidates] = useState<any[]>([])
    const [pendingAction, setPendingAction] = useState<'deploy' | 'delete' | null>(null)

    // --- UI UX STATE ---
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' | 'info' } | null>(null)
    const [downloadSelector, setDownloadSelector] = useState<{ model: LineModelOption, candidates: any[] } | null>(null)
    const [isDownloading, setIsDownloading] = useState(false)
    const toastTimer = useRef<any>(null)

    // --- HELPER: URL Updates ---
    // Update URL without removing existing params (important for staying in the modal)
    const updateParams = (updates: Record<string, string | null>) => {
        setSearchParams(prev => {
            const next = new URLSearchParams(prev);
            Object.entries(updates).forEach(([key, value]) => {
                if (value === null) next.delete(key);
                else next.set(key, value);
            });
            return next;
        });
    }

    const openSubModal = (type: string) => updateParams({ sub: type });
    const closeSubModal = () => updateParams({ sub: null, mode: null });

    const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        setToast({ msg, type })
        toastTimer.current = setTimeout(() => setToast(null), 4000)
    }

    useEffect(() => { loadModels() }, [lineNumber])

    const loadModels = async () => {
        try {
            setLoading(true)
            const data = await factoryApi.getLineAvailableModels(lineNumber, version)
            setModels(data)
        } catch (err: any) {
            console.error('Failed to load models:', err)
        } finally {
            setLoading(false)
            if (onOperationComplete) onOperationComplete()
        }
    }

    const fetchLinePCs = async () => {
        const res = await factoryApi.getPCs(version, lineNumber)
        let linePCs: any[] = []
        if (res && res.lines && Array.isArray(res.lines)) {
            res.lines.forEach((g: any) => {
                if (Array.isArray(g.pcs)) linePCs.push(...g.pcs)
            })
        } else if (Array.isArray(res)) {
            linePCs = res
        }
        return linePCs
    }

    const handleApply = async () => {
        if (!selectedModel) {
            showToast('Please select a model', 'error')
            return
        }

        try {
            const linePCs = await fetchLinePCs()
            const offlinePCs = linePCs.filter((p: any) => !p.isOnline)
            setCurrentDeploymentCandidates([...linePCs])

            if (offlinePCs.length > 0) {
                setOfflineCandidates([...offlinePCs])
                setPendingAction('deploy')
                openSubModal('offline_alert'); // Open via URL
                return
            }

            // Open Confirm via URL
            openSubModal('confirm_deploy');

        } catch (e) {
            console.error("Failed to check offline status", e)
            showToast("Failed to verify PC connectivity.", 'error')
        }
    }

    const handleDelete = async () => {
        if (!selectedModel) return
        try {
            const linePCs = await fetchLinePCs()
            const offlinePCs = linePCs.filter((p: any) => !p.isOnline)
            setCurrentDeploymentCandidates([...linePCs])

            if (offlinePCs.length > 0) {
                setOfflineCandidates([...offlinePCs])
                setPendingAction('delete')
                openSubModal('offline_alert');
                return
            }
            openSubModal('confirm_delete');
        } catch (e) {
            showToast("Failed check", 'error')
        }
    }

    const handleProceedOnlineOnly = async () => {
        closeSubModal();

        const onlinePCs = currentDeploymentCandidates.filter((p: any) => !!p.isOnline)
        if (onlinePCs.length === 0) {
            showToast("No online PCs found in this line.", 'error')
            return
        }

        if (pendingAction === 'deploy') {
            await executeApplyWithTargets(onlinePCs)
        } else if (pendingAction === 'delete') {
            await executeDeleteWithTargets(onlinePCs);
        }
    }

    const executeApplyWithTargets = async (targets: any[]) => {
        const model = models.find(m => m.modelName === selectedModel)
        if (!model) return

        setIsApplying(true)
        closeSubModal(); // Close confirm

        try {
            const useSelected = targets.length < model.totalPCsInLine;
            const payload: ApplyModelRequest = {
                modelFileId: model.modelFileId || 0,
                targetType: useSelected ? 'selected' : (version ? 'lineandversion' : 'line'),
                lineNumber: lineNumber,
                version: version,
                applyImmediately: true,
                forceOverwrite: forceOverwrite,
                modelName: model.modelName
            }
            if (useSelected) payload.selectedPCIds = targets.map(p => p.pcId)

            const res = await factoryApi.applyModel(payload)
            showToast(res.message, 'success')
            loadModels()
        } catch (err: any) {
            showToast(err.message || 'Failed to apply model', 'error')
        } finally {
            setIsApplying(false)
            setPendingAction(null)
        }
    }

    const executeDeleteWithTargets = async (targets: any[]) => {
        setIsDeleting(true)
        closeSubModal()
        try {
            const model = models.find(m => m.modelName === selectedModel)
            if (targets.length === model?.totalPCsInLine) {
                await factoryApi.deleteLineModel(lineNumber, selectedModel)
            } else {
                await Promise.all(targets.map(p => factoryApi.deleteModelFromPC(p.pcId, selectedModel)))
            }
            showToast(`Deleted "${selectedModel}"`, 'success')
            loadModels()
            setSelectedModel('')
        } catch (err: any) {
            showToast("Delete failed: " + err.message, 'error')
        } finally {
            setIsDeleting(false)
            setPendingAction(null)
            if (onOperationComplete) onOperationComplete()
        }
    }

    const validateDownloadTarget = (targetPC: any) => {
        if (!targetPC) { showToast("Target PC not found.", 'error'); return false; }
        if (!targetPC.isOnline) { showToast(`PC ${targetPC.pcNumber} is OFFLINE.`, 'error'); return false; }
        return true
    }

    const executeAgentDownload = async (pcId: number, modelName: string) => {
        setIsDownloading(true)
        closeSubModal()

        try {
            showToast(`Request sent to PC. Please wait...`, 'info')
            const { requestId } = await factoryApi.requestDownloadFromPC(pcId, modelName)

            let attempts = 0
            const maxAttempts = 30
            const pollInterval = setInterval(async () => {
                attempts++
                try {
                    const statusRes = await factoryApi.checkDownloadStatus(requestId)
                    if (statusRes.status === 'Ready') {
                        clearInterval(pollInterval)
                        setIsDownloading(false)
                        const downloadLink = factoryApi.getDownloadUrl(requestId)
                        window.open(downloadLink, '_blank')
                        showToast("Download ready!", 'success')
                    } else if (statusRes.status === 'Failed') {
                        clearInterval(pollInterval)
                        setIsDownloading(false)
                        showToast(`Download failed: ${statusRes.error}`, 'error')
                    }
                    if (attempts >= maxAttempts) {
                        clearInterval(pollInterval)
                        setIsDownloading(false)
                        showToast("Download timed out waiting for Agent.", 'error')
                    }
                } catch (e) {
                    clearInterval(pollInterval)
                    setIsDownloading(false)
                }
            }, 2000)
        } catch (err: any) {
            setIsDownloading(false)
            showToast(err.message || "Failed to initiate download", 'error')
        }
    }

    const handleDownload = async () => {
        const model = models.find(m => m.modelName === selectedModel)
        if (!model) return

        if (model.inLibrary && model.modelFileId) {
            try {
                setIsDownloading(true)
                const blob = await factoryApi.downloadModelTemplate(model.modelFileId)
                const url = window.URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = `${model.modelName}.zip`
                document.body.appendChild(a)
                a.click()
                a.remove()
                window.URL.revokeObjectURL(url)
                showToast("Download started", 'success')
            } catch (err) { showToast('Download failed', 'error') }
            finally { setIsDownloading(false) }
            return
        }

        try {
            const linePCs = await fetchLinePCs()
            if (!model.availableOnPCIds || model.availableOnPCIds.length === 0) {
                showToast("No PCs found.", 'error'); return;
            }

            if (model.availableOnPCIds.length > 1) {
                const candidates = linePCs.filter((p: any) => model.availableOnPCIds.includes(p.pcId))
                setDownloadSelector({ model, candidates })
                updateParams({ mode: 'download_select' }) // Push to URL
                return
            }

            const targetPCId = model.availableOnPCIds[0]
            const targetPC = linePCs.find((p: any) => p.pcId === targetPCId)
            if (!validateDownloadTarget(targetPC)) return

            // Execute direct or confirm? Let's execute direct if single choice to be simple
            executeAgentDownload(targetPCId, model.modelName)

        } catch (err: any) {
            showToast(err.message || "Failed to initiate download", 'error')
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <Layers size={20} color="var(--primary)" />
                        <div>
                            <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Line {lineNumber} Manager</h2>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Manage models for all units in this line</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn btn-secondary btn-icon"><X size={20} /></button>
                </div>

                {/* Body Content ... same as before ... */}
                <div className="modal-body" style={{ position: 'relative', minHeight: '300px' }}>
                    {loading && <LoadingOverlay message="Loading models..." />}
                    {isApplying && <LoadingOverlay message="Deploying model to line..." />}
                    {isDeleting && <LoadingOverlay message="Deleting model from line..." />}
                    {isDownloading && <LoadingOverlay message="Waiting for Agent to upload..." />}

                    {!loading && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            <div>
                                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '0.5rem', display: 'block' }}>
                                    Select Target Model
                                </label>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <select
                                        className="input-field"
                                        value={selectedModel}
                                        onChange={e => setSelectedModel(e.target.value)}
                                    >
                                        <option value="" disabled>Select a model...</option>
                                        {models.map(m => (
                                            <option key={m.modelName} value={m.modelName}>
                                                {m.modelName} • {m.inLibrary ? 'Library' : 'Local Only'} • {m.complianceText}
                                            </option>
                                        ))}
                                    </select>
                                    <button className="btn btn-secondary btn-icon" onClick={loadModels}><RefreshCw size={18} /></button>
                                </div>
                            </div>

                            {selectedModel && (
                                <div className="card" style={{ padding: '1rem', background: 'var(--bg-hover)' }}>
                                    {(() => {
                                        const m = models.find(x => x.modelName === selectedModel)
                                        if (!m) return null
                                        const isFullyCompliant = m.complianceCount === m.totalPCsInLine
                                        return (
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                                    <div>
                                                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{m.modelName}</div>
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                                                            {m.inLibrary ? (
                                                                <span className="badge badge-success" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}><Cloud size={10} /> Library</span>
                                                            ) : (
                                                                <span className="badge badge-warning" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}><Wifi size={10} /> PC Local</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: isFullyCompliant ? 'var(--success)' : 'var(--primary)' }}>
                                                            {Math.round((m.complianceCount / m.totalPCsInLine) * 100)}%
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Compliance</div>
                                                    </div>
                                                </div>

                                                <div style={{ marginBottom: '1rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                                        <span>Deployment Progress</span>
                                                        <span>{m.complianceText}</span>
                                                    </div>
                                                    <div style={{ height: '6px', background: 'var(--bg-main)', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{
                                                            height: '100%',
                                                            width: `${(m.complianceCount / m.totalPCsInLine) * 100}%`,
                                                            background: isFullyCompliant ? 'var(--success)' : 'var(--primary)',
                                                            transition: 'width 0.3s ease'
                                                        }} />
                                                    </div>
                                                </div>

                                                {m.inLibrary && (
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={forceOverwrite}
                                                                onChange={e => setForceOverwrite(e.target.checked)}
                                                            />
                                                            <span>Force Overwrite</span>
                                                        </label>
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                                    <button
                                                        className="btn btn-primary"
                                                        style={{ flex: 1, justifyContent: 'center', padding: '0.75rem' }}
                                                        onClick={handleApply}
                                                        disabled={isApplying || (!m.inLibrary && m.complianceCount < m.totalPCsInLine)}
                                                    >
                                                        {isApplying ? <div className="pulse" /> : <CheckCircle size={18} />}
                                                        {isApplying ? 'Deploying...' :
                                                            (m.inLibrary ? 'Deploy to Line' :
                                                                (m.complianceCount === m.totalPCsInLine ? 'Activate on All' : 'Upload First')
                                                            )
                                                        }
                                                    </button>

                                                    <button
                                                        className="btn btn-secondary"
                                                        style={{ width: '42px', height: '42px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        onClick={handleDownload}
                                                        title="Download"
                                                    >
                                                        <Download size={20} />
                                                    </button>

                                                    <button
                                                        className="btn btn-danger"
                                                        style={{ width: '42px', height: '42px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                                        onClick={handleDelete}
                                                        disabled={isDeleting}
                                                        title="Delete"
                                                    >
                                                        <Trash2 size={20} />
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    })()}
                                </div>
                            )}

                            {!selectedModel && (
                                <div style={{ textAlign: 'center', padding: '2rem', border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-dim)' }}>
                                    <Layers size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                                    <div>Select a model</div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* --- NESTED MODALS (URL DRIVEN) --- */}

                {/* Confirm Deploy */}
                {activeSubModal === 'confirm_deploy' && (
                    <ConfirmModal
                        title="Confirm Deployment"
                        message={`Apply model "${selectedModel}" to Line ${lineNumber}?` + (forceOverwrite ? "\n(Force Overwrite ON)" : "")}
                        onConfirm={() => executeApplyWithTargets(currentDeploymentCandidates)}
                        onCancel={closeSubModal}
                    />
                )}

                {/* Confirm Delete */}
                {activeSubModal === 'confirm_delete' && (
                    <ConfirmModal
                        title="Confirm Deletion"
                        message={`Delete "${selectedModel}" from Line ${lineNumber}?`}
                        onConfirm={() => executeDeleteWithTargets(currentDeploymentCandidates)}
                        onCancel={closeSubModal}
                    />
                )}

                {/* Offline Alert */}
                {activeSubModal === 'offline_alert' && (
                    <OfflineAlertModal
                        offlineCandidates={offlineCandidates}
                        onCancel={closeSubModal}
                        onProceedOnlineOnly={handleProceedOnlineOnly}
                        actionLabel={pendingAction === 'delete' ? 'Delete from Online Only' : 'Run on Online Agents'}
                    />
                )}

                {/* Download Selector */}
                {isDownloadSelect && downloadSelector && (
                    <div className="modal-overlay" onClick={closeSubModal} style={{ zIndex: 2200 }}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                            <div className="modal-header">
                                <h3 style={{ fontSize: '1rem', margin: 0 }}>Select Source PC</h3>
                                <button onClick={closeSubModal} className="btn btn-secondary btn-icon"><X size={18} /></button>
                            </div>
                            <div className="modal-body">
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                    Model "{downloadSelector.model.modelName}" is available on multiple PCs. Select one to download from:
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.75rem' }}>
                                    {downloadSelector.candidates.map((pc: any) => (
                                        <button
                                            key={pc.pcId}
                                            className="card"
                                            style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', border: '1px solid var(--border)', background: 'var(--bg-card)' }}
                                            onClick={() => {
                                                closeSubModal()
                                                executeAgentDownload(pc.pcId, downloadSelector.model.modelName)
                                            }}
                                        >
                                            <Monitor size={20} color={pc.isOnline ? 'var(--success)' : 'var(--text-muted)'} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>PC {pc.pcNumber}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}