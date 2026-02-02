import { useEffect, useState, useRef } from 'react'
import { X, CheckCircle, RefreshCw, AlertTriangle, Layers, Cloud, Wifi, Trash2, Download, Monitor } from 'lucide-react'
import { factoryApi } from '../services/api'
import type { LineModelOption, ApplyModelRequest } from '../types'
import { LoadingOverlay } from './LoadingOverlay'
import { Toast } from './Toast'
import { ConfirmModal } from './ConfirmModal'
import { OfflineAlertModal } from './OfflineAlertModal'
import { PCSelectionView } from './PCSelection' // <--- 1. Import Added

type ConfirmState = {
    title: string
    message: string
    onConfirm: () => void
    onCancel: () => void
}

interface Props {
    lineNumber: number
    version?: string
    onClose: () => void
    onOperationComplete?: () => void
}

export default function LineModelManagerModal({ lineNumber, version, onClose, onOperationComplete }: Props) {
    const [loading, setLoading] = useState(true)
    const [models, setModels] = useState<LineModelOption[]>([])
    const [selectedModel, setSelectedModel] = useState<string>('')

    // Action state
    const [isApplying, setIsApplying] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [forceOverwrite, setForceOverwrite] = useState(false)

    // Offline Alert State
    const [showOfflineAlert, setShowOfflineAlert] = useState(false)
    const [offlineCandidates, setOfflineCandidates] = useState<any[]>([])
    const [currentDeploymentCandidates, setCurrentDeploymentCandidates] = useState<any[]>([])
    const [pendingAction, setPendingAction] = useState<'deploy' | 'delete' | null>(null)

    // --- NEW STATE for Selection Mode ---
    const [isSelectionMode, setIsSelectionMode] = useState(false)
    const [linePCs, setLinePCs] = useState<any[]>([])

    // --- UI UX STATE ---
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' | 'info' } | null>(null)

    const [confirmModal, setConfirmModal] = useState<ConfirmState | null>(null)
    const [downloadSelector, setDownloadSelector] = useState<{ model: LineModelOption, candidates: any[] } | null>(null)
    const [isDownloading, setIsDownloading] = useState(false)
    const toastTimer = useRef<any>(null)

    // --- HELPERS ---
    const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        setToast({ msg, type })
        toastTimer.current = setTimeout(() => setToast(null), 4000)
    }

    const openConfirm = (title: string, message: string, onConfirm: () => void) => {
        setConfirmModal({ title, message, onConfirm, onCancel: () => setConfirmModal(null) })
    }

    // --- DATA LOADING & POLLING ---

    // Function to load models. isBackground=true prevents full screen spinner.
    const loadModels = async (isBackground = false) => {
        try {
            if (!isBackground) setLoading(true)
            const data = await factoryApi.getLineAvailableModels(lineNumber, version)
            setModels(data)
        } catch (err: any) {
            console.error('Failed to load models:', err)
        } finally {
            if (!isBackground) setLoading(false)
        }
    }

    // Initial load + Polling Interval
    useEffect(() => {
        loadModels()
        let interval: any = null;
        // Pause polling if we are in selection mode or doing an action
        if (!isApplying && !isDeleting && !isDownloading && !isSelectionMode) {
            interval = setInterval(() => {
                loadModels(true)
            }, 3000)
        }
        return () => { if (interval) clearInterval(interval) }
    }, [lineNumber, version, isApplying, isDeleting, isDownloading, isSelectionMode])

    // Reuseable MC Fetcher
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

    // --- MODIFIED: Handle Apply Logic ---
    const handleApply = async () => {
        if (!selectedModel) {
            showToast('Please select a model', 'error')
            return
        }

        try {
            const currentModel = models.find(m => m.modelName === selectedModel)
            const pcs = await fetchLinePCs()

            // === 1. Library Model -> Open Checklist ===
            if (currentModel && currentModel.inLibrary) {
                setLinePCs(pcs)
                setIsSelectionMode(true)
                return
            }

            // === 2. Local Model -> Standard Offline Check ===
            const offlinePCs = pcs.filter((p: any) => !p.isOnline)
            setCurrentDeploymentCandidates([...pcs])

            if (offlinePCs.length > 0) {
                setOfflineCandidates([...offlinePCs])
                setPendingAction('deploy')
                setShowOfflineAlert(true)
                return
            }

            await executeApplyWithTargets(pcs)

        } catch (e) {
            console.error("Failed to check offline status", e)
            showToast("Failed to verify MC connectivity.", 'error')
        }
    }


    // --- NEW: Helper for Checklist Deployment ---
    const handleDeployFromSelection = async (selectedIds: number[]) => {
        const targets = linePCs.filter(p => selectedIds.includes(p.pcId))
        await executeApplyWithTargets(targets)
        setIsSelectionMode(false) // Exit selection mode
    }

    const checkAndExecuteDelete = async () => {
        setIsDeleting(true)
        try {
            // Check for offlines
            const linePCs = await fetchLinePCs()
            const offlinePCs = linePCs.filter((p: any) => !p.isOnline)
            setCurrentDeploymentCandidates([...linePCs])

            if (offlinePCs.length > 0) {
                setOfflineCandidates([...offlinePCs])
                setPendingAction('delete')
                setShowOfflineAlert(true)
                setIsDeleting(false)
                return
            }

            // All online: use efficient bulk delete
            const res = await factoryApi.deleteLineModel(lineNumber, selectedModel)
            showToast(res.message, 'success')

            // Wait a moment for DB consistency, then reload
            await new Promise(r => setTimeout(r, 500))
            await loadModels()

            setSelectedModel('')
        } catch (err: any) {
            showToast(err.message || 'Delete failed', 'error')
        } finally {
            setIsDeleting(false)
            if (onOperationComplete) onOperationComplete()
        }
    }

    const handleDelete = async () => {
        if (!selectedModel) return
        openConfirm(
            "Confirm Deletion",
            `Are you sure you want to delete "${selectedModel}" from all MCs in Line ${lineNumber}? This action cannot be undone.`,
            checkAndExecuteDelete
        )
    }

    const validateDownloadTarget = (targetPC: any) => {
        if (!targetPC) { showToast("Target MC not found in current line data.", 'error'); return false; }
        if (!targetPC.isOnline) { showToast(`MC-${targetPC.mcNumber} is OFFLINE. Cannot download.`, 'error'); return false; }
        return true
    }

    const executeAgentDownload = async (mcId: number, modelName: string) => {
        setIsDownloading(true)
        try {
            showToast(`Request sent to pc. Please wait...`, 'info')
            const { requestId } = await factoryApi.requestDownloadFromPC(mcId, modelName)

            // Poll Logic
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
                        loadModels()
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
            return
        }

        // 2. MC Download (Agent Interaction)
        if (!model.inLibrary) {
            try {
                const linePCs = await fetchLinePCs()

                if (!model.availableOnMCIds || model.availableOnMCIds.length === 0) {
                    showToast("No MCs found with this model.", 'error')
                    return
                }

                // --- CHANGED: Filter strictly for ONLINE MCs ---
                const onlineCandidates = linePCs.filter((p: any) =>
                    model.availableOnMCIds.includes(p.mcId) && p.isOnline
                )
                if (onlineCandidates.length === 0) {
                    showToast("No ONLINE MCs found with this model to download from.", 'error')
                    return
                }
                if (onlineCandidates.length > 1) {
                    setDownloadSelector({ model, candidates: onlineCandidates })
                    return
                }
                const targetPC = onlineCandidates[0]
                openConfirm(
                    "Confirm Download Request",
                    `Request model "${model.modelName}" from MC ${targetPC.mcNumber}?\nThis will zip the model folder on the MC and upload it to the server.`,
                    () => executeAgentDownload(targetPC.mcId, model.modelName)
                )
            } catch (err: any) {
                showToast(err.message || "Failed to initiate download", 'error')
            }
        }
    }

    const handleProceedOnlineOnly = async () => {
        setShowOfflineAlert(false)
        const onlinePCs = currentDeploymentCandidates.filter((p: any) => !!p.isOnline)

        if (onlinePCs.length === 0) {
            showToast("No online MCs found in this line.", 'error')
            return
        }

        if (pendingAction === 'deploy') {
            await executeApplyWithTargets(onlinePCs)
        }
        else if (pendingAction === 'delete') {
            setIsDeleting(true)
            try {
                // Delete individually from Online MCs
                await Promise.all(onlinePCs.map(p => factoryApi.deleteModelFromPC(p.mcId, selectedModel)))
                showToast(`Deleted "${selectedModel}" from ${onlinePCs.length} Online MCs.`, 'success')
                await new Promise(r => setTimeout(r, 500))
                loadModels()
                setSelectedModel('')
            } catch (err: any) {
                showToast("Partial deletion failed: " + err.message, 'error')
            } finally {
                setIsDeleting(false)
                setPendingAction(null)
                if (onOperationComplete) onOperationComplete()
            }
        }
    }

    const executeApplyWithTargets = async (targets: any[]) => {
        const model = models.find(m => m.modelName === selectedModel)
        if (!model) return

        const targetDesc = (targets.length > 0 && targets.length < model.totalPCsInLine)
            ? `${targets.length} Online MCs`
            : `ALL ${model.totalPCsInLine} PCs`

        openConfirm(
            "Confirm Deployment",
            `Apply model "${selectedModel}" to ${targetDesc} in Line ${lineNumber}?` + (forceOverwrite ? "\n(Force Overwrite is ON)" : ""),
            async () => {
                setIsApplying(true)
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
                    if (useSelected) payload.selectedMCIds = targets.map(p => p.mcId)

                    const res = await factoryApi.applyModel(payload)
                    showToast(res.message, 'success')
                    await new Promise(r => setTimeout(r, 500))
                    await loadModels()
                    if (onOperationComplete) onOperationComplete()
                } catch (err: any) {
                    showToast(err.message || 'Failed to apply model', 'error')
                } finally {
                    setIsApplying(false)
                    setPendingAction(null)
                }
            }
        )
    }

    const getSelectedModelInfo = () => models.find(m => m.modelName === selectedModel)

    const getModelStats = (m: any) => {
        let count = m.complianceCount ?? m.ComplianceCount
        if (count === undefined) {
            const ids = m.availableOnPCIds ?? m.AvailableOnPCIds
            count = Array.isArray(ids) ? ids.length : 0
        }
        const total = m.totalPCsInLine ?? m.TotalPCsInLine ?? 0
        const percent = total > 0 ? Math.round((count / total) * 100) : 0
        return { count, total, percent }
    }

    const renderModelOption = (m: LineModelOption) => {
        const stats = getModelStats(m)
        return (
            <option key={m.modelName} value={m.modelName}>
                {m.modelName} • {stats.count}/{stats.total} Devices
            </option>
        )
    }

    const libraryModels = models.filter(m => m.inLibrary)
    const localModels = models.filter(m => !m.inLibrary)

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>

                {/* Header */}
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

                {/* Body */}
                <div className="modal-body" style={{ position: 'relative', minHeight: '300px' }}>
                    {loading && <LoadingOverlay message="Loading models..." />}
                    {isApplying && <LoadingOverlay message="Deploying model to line..." />}
                    {isDeleting && <LoadingOverlay message="Deleting model from line..." />}
                    {isDownloading && <LoadingOverlay message="Waiting for Agent to upload..." />}

                    {!loading && !isSelectionMode && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                            {/* Model Selection */}
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
                                        <option value="" disabled hidden>
                                            Select a model...
                                        </option>
                                        {libraryModels.length > 0 && (
                                            <optgroup label="Library Models">
                                                {libraryModels.map(renderModelOption)}
                                            </optgroup>
                                        )}
                                        {localModels.length > 0 && (
                                            <optgroup label="Local Only (PC)">
                                                {localModels.map(renderModelOption)}
                                            </optgroup>
                                        )}
                                        {models.length === 0 && <option disabled>No models found</option>}
                                    </select>
                                    <button className="btn btn-secondary btn-icon" onClick={() => loadModels(false)}><RefreshCw size={18} /></button>
                                </div>
                            </div>

                            {/* Details & Actions */}
                            {selectedModel && (
                                <div className="card" style={{ padding: '1rem', background: 'var(--bg-hover)' }}>
                                    {(() => {
                                        const m = getSelectedModelInfo()
                                        if (!m) return null
                                        const stats = getModelStats(m)
                                        const isFullyCompliant = stats.count === stats.total && stats.total > 0

                                        return (
                                            <div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                                                    <div>
                                                        <div style={{ fontWeight: 700, fontSize: '1rem' }}>{m.modelName}</div>
                                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                                                            {m.inLibrary ? (
                                                                <span className="badge badge-success" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}><Cloud size={10} /> Library</span>
                                                            ) : (
                                                                <span className="badge badge-warning" style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}><Wifi size={10} /> MC Local</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: isFullyCompliant ? 'var(--success)' : 'var(--primary)' }}>
                                                            {stats.percent}%
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>Compliance</div>
                                                    </div>
                                                </div>

                                                {/* Progress Bar */}
                                                <div style={{ marginBottom: '1rem' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.25rem' }}>
                                                        <span>Deployment Progress</span>
                                                        <span>{stats.count} of {stats.total} PCs ({stats.percent}%)</span>
                                                    </div>
                                                    <div style={{ height: '6px', background: 'var(--bg-main)', borderRadius: '3px', overflow: 'hidden' }}>
                                                        <div style={{
                                                            height: '100%',
                                                            width: `${stats.percent}%`,
                                                            background: isFullyCompliant ? 'var(--success)' : 'var(--primary)',
                                                            transition: 'width 0.3s ease'
                                                        }} />
                                                    </div>
                                                </div>

                                                {/* Options */}
                                                {m.inLibrary && (
                                                    <div style={{ marginBottom: '1rem' }}>
                                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', cursor: 'pointer' }}>
                                                            <input type="checkbox" checked={forceOverwrite} onChange={e => setForceOverwrite(e.target.checked)} />
                                                            <span>Force Overwrite (Re-upload model to all PCs)</span>
                                                        </label>
                                                    </div>
                                                )}

                                                {/* Action Buttons */}
                                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                                                    <button
                                                        className="btn btn-primary"
                                                        style={{ flex: 1, justifyContent: 'center', padding: '0.75rem' }}
                                                        onClick={handleApply}
                                                        disabled={isApplying || (!m.inLibrary && stats.count < stats.total)}
                                                    >
                                                        {isApplying ? <div className="pulse" style={{ background: 'black' }} /> : <CheckCircle size={18} />}
                                                        {isApplying ? 'Deploying...' : (m.inLibrary ? 'Deploy to Line' : (stats.count === stats.total ? 'Activate on All' : 'Upload to Library First'))}
                                                    </button>

                                                    <button className="btn btn-secondary" style={{ width: '42px', height: '42px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={handleDownload} title={m.inLibrary ? "Download ZIP from Library" : "Download from PC"}>
                                                        <Download size={20} style={{ opacity: m.inLibrary ? 1 : 0.8 }} />
                                                    </button>

                                                    <button className="btn btn-danger" style={{ width: '42px', height: '42px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={handleDelete} disabled={isDeleting} title="Delete from Line">
                                                        {isDeleting ? <div className="pulse" /> : <Trash2 size={20} />}
                                                    </button>
                                                </div>

                                                {!m.inLibrary && stats.count < stats.total && (
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--warning)', marginTop: '0.5rem', textAlign: 'center' }}>
                                                        <AlertTriangle size={10} style={{ display: 'inline', marginRight: '0.25rem' }} />
                                                        This model must be uploaded to the server library before it can be deployed to the line.
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })()}
                                </div>
                            )}

                            {!selectedModel && (
                                <div style={{ textAlign: 'center', padding: '2rem', border: '2px dashed var(--border)', borderRadius: 'var(--radius-md)', color: 'var(--text-dim)' }}>
                                    <Layers size={32} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                                    <div>Select a model to view details</div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- NEW: CHECKLIST VIEW --- */}
                    {!loading && isSelectionMode && (
                        <PCSelectionView
                            pcs={linePCs}
                            modelName={selectedModel}
                            onBack={() => setIsSelectionMode(false)}
                            onDeploy={handleDeployFromSelection}
                        />
                    )}
                </div>

                {/* Confirm Modal */}
                {confirmModal && <ConfirmModal title={confirmModal.title} message={confirmModal.message} onConfirm={() => { confirmModal.onConfirm(); setConfirmModal(null); }} onCancel={() => setConfirmModal(null)} />}

                {/* Download Selector */}
                {downloadSelector && (
                    <div className="modal-overlay" onClick={() => setDownloadSelector(null)} style={{ zIndex: 2200 }}>
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                            <div className="modal-header">
                                <h3 style={{ fontSize: '1rem', margin: 0 }}>Select Source MC</h3>
                                <button onClick={() => setDownloadSelector(null)} className="btn btn-secondary btn-icon"><X size={18} /></button>
                            </div>
                            <div className="modal-body">
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                                    Model "{downloadSelector.model.modelName}" is available on multiple Online MCs. Select one to download from:
                                </p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: '0.75rem' }}>
                                    {downloadSelector.candidates.map((pc: any) => (
                                        <button
                                            key={pc.mcId}
                                            className="card"
                                            style={{
                                                padding: '0.75rem',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                alignItems: 'center',
                                                gap: '0.25rem',
                                                border: '1px solid var(--border)',
                                                background: pc.isOnline
                                                    ? 'linear-gradient(135deg, rgba(52, 211, 153, 0.2), rgba(52, 211, 153, 0.1))'
                                                    : 'linear-gradient(135deg, rgba(248, 113, 113, 0.2), rgba(248, 113, 113, 0.1))',
                                                color: 'white',
                                                borderBottom: `1px solid ${pc.isOnline ? 'var(--success)' : 'var(--danger)'}`
                                            }}
                                            onClick={() => {
                                                setDownloadSelector(null)
                                                // Always online now due to filter, but checking logic is safe
                                                if (validateDownloadTarget(pc)) {
                                                    confirmModal ? null : openConfirm("Confirm Download", `Request model from MC ${pc.mcNumber}?`, () => executeAgentDownload(pc.mcId, downloadSelector.model.modelName))
                                                }
                                            }}
                                        >
                                            <Monitor size={20} color='var(--success)' />
                                            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>MC {pc.mcNumber}</span>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--success)' }}>Online</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Offline Alert Modal */}
                {showOfflineAlert && (
                    <OfflineAlertModal
                        offlineCandidates={offlineCandidates}
                        onCancel={() => setShowOfflineAlert(false)}
                        onProceedOnlineOnly={handleProceedOnlineOnly}
                        actionLabel={pendingAction === 'delete' ? 'Delete from Online Only' : 'Run on Online Agents'}
                    />
                )}
            </div>
        </div>
    )
}



