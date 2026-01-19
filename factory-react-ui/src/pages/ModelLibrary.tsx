import { useEffect, useState, useRef } from 'react'
import { Package, Upload, Trash2, Rocket, Download, X, HardDrive, AlertTriangle } from 'lucide-react'
// 1. Add Imports
import { useSearchParams } from 'react-router-dom';
import NotFound from './NotFound';

import { factoryApi } from '../services/api'
import type { ModelFile, ApplyModelRequest, FactoryPC } from '../types'
import { LoadingOverlay } from '../components/LoadingOverlay'
import { Toast } from '../components/Toast'
import { ConfirmModal } from '../components/ConfirmModal'
import { OfflineAlertModal } from '../components/OfflineAlertModal'
import { eventBus, EVENTS } from '../utils/eventBus'

export default function ModelLibrary() {
    // 2. UPDATED VALIDATION: Allow state params for navigation
    const [searchParams, setSearchParams] = useSearchParams();

    // Define allowed keys for navigation
    const allowedKeys = ['modal', 'alert', 'prompt', 'modelId'];
    // Check if there are any keys NOT in the allowed list
    const hasUnknownParams = Array.from(searchParams.keys()).some(key => !allowedKeys.includes(key));

    if (hasUnknownParams) {
        return <NotFound />;
    }

    // --- URL STATE DECODING ---
    const activeModal = searchParams.get('modal'); // 'upload', 'deploy'
    const activeAlert = searchParams.get('alert'); // 'offline'
    const activePrompt = searchParams.get('prompt'); // 'overwrite', 'confirm_delete'
    const targetModelId = searchParams.get('modelId');

    const [models, setModels] = useState<ModelFile[]>([])
    const [versions, setVersions] = useState<string[]>([])

    // We fetch logic lines, but we also rely on PC data for dynamic lines
    const [allLines, setAllLines] = useState<number[]>([])

    // MASTER DATA: Store all PCs to do robust client-side filtering
    const [allPCs, setAllPCs] = useState<FactoryPC[]>([])

    const [loading, setLoading] = useState(true)

    // Form States (Visibility is now driven by URL, but data is local)
    const [uploadFile, setUploadFile] = useState<File | null>(null)
    const [uploadName, setUploadName] = useState('')
    const [uploadDesc, setUploadDesc] = useState('')
    const [uploadCategory, setUploadCategory] = useState('')
    const [isUploading, setIsUploading] = useState(false)

    // Deploy Form
    const [applyTarget, setApplyTarget] = useState<'all' | 'version' | 'lineandversion'>('all')
    const [applyVersion, setApplyVersion] = useState('')
    const [applyLines, setApplyLines] = useState<number[]>([])
    const [isDeploying, setIsDeploying] = useState(false)

    // New actions states
    const [isDownloading, setIsDownloading] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    // Filtered Content for UI
    const [shownLines, setShownLines] = useState<number[]>([])

    // Offline Alert State
    const [offlineCandidates, setOfflineCandidates] = useState<FactoryPC[]>([])
    const [currentDeploymentCandidates, setCurrentDeploymentCandidates] = useState<FactoryPC[]>([])

    // Overwrite Confirm State
    const [overwriteStats, setOverwriteStats] = useState({ total: 0, existing: 0 })
    const [pendingRequest, setPendingRequest] = useState<ApplyModelRequest | null>(null)
    const [deleteTargetId, setDeleteTargetId] = useState<number | null>(null);

    // --- UI UX STATE ---
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' | 'info' } | null>(null)
    const toastTimer = useRef<any>(null)

    // Derived Selection from URL
    const selectedModel = models.find(m => m.modelFileId.toString() === targetModelId) || null;

    // --- HELPERS ---
    const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        setToast({ msg, type })
        toastTimer.current = setTimeout(() => setToast(null), 4000)
    }

    // --- NAVIGATION HELPERS ---
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

    const openUpload = () => updateParams({ modal: 'upload' });
    const closeUpload = () => updateParams({ modal: null });

    const openDeploy = (modelId: number) => updateParams({ modal: 'deploy', modelId: modelId.toString() });
    const closeDeploy = () => updateParams({ modal: null, modelId: null, alert: null, prompt: null });

    const openOfflineAlert = () => updateParams({ alert: 'offline' });
    const closeOfflineAlert = () => updateParams({ alert: null });

    const openOverwriteConfirm = () => updateParams({ prompt: 'overwrite' });
    const closeOverwriteConfirm = () => updateParams({ prompt: null });

    const openDeleteConfirm = (id: number) => {
        setDeleteTargetId(id);
        updateParams({ prompt: 'confirm_delete' });
    };
    const closeDeleteConfirm = () => {
        setDeleteTargetId(null);
        updateParams({ prompt: null });
    };

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        setLoading(true)
        try {
            const [m, v, l, pcsRes] = await Promise.all([
                factoryApi.getLibraryModels(),
                factoryApi.getVersions(),
                factoryApi.getLines(),
                factoryApi.getPCs() // Fetch ALL (no params, returns object)
            ])
            setModels(m); setVersions(v); setAllLines(l);
            setShownLines(l);

            // FIX: getPCs returns { lines: LineGroup[] }
            let flatList: FactoryPC[] = []

            // Check for expected structure
            if (pcsRes && pcsRes.lines && Array.isArray(pcsRes.lines)) {
                // Flatten: lines -> pcs
                pcsRes.lines.forEach((lineGroup: any) => {
                    if (Array.isArray(lineGroup.pcs)) {
                        flatList.push(...lineGroup.pcs)
                    }
                })
            } else if (Array.isArray(pcsRes)) {
                // Legacy fallback if it returns array directly
                flatList = pcsRes
            }

            setAllPCs(flatList)

        } catch (e) {
            console.error("Failed to load data", e)
            showToast("Failed to load content", 'error')
        } finally {
            setLoading(false)
        }
    }

    // --- HELPER: Pure Filtering Logic ---
    const getFilteredTargets = (): FactoryPC[] => {
        let targets = [...allPCs]

        if (applyTarget === 'version') {
            if (!applyVersion) return []
            targets = targets.filter(p => p.modelVersion === applyVersion)
        }
        else if (applyTarget === 'lineandversion') {
            if (!applyVersion) return []
            targets = targets.filter(p => p.modelVersion === applyVersion)
            if (applyLines.length > 0) {
                targets = targets.filter(p => applyLines.includes(p.lineNumber))
            } else {
                return []
            }
        }
        return targets
    }

    // --- UI Handlers ---

    const handleVersionChange = (version: string) => {
        setApplyVersion(version)
        setApplyLines([])

        if (version) {
            const versionPCs = allPCs.filter(p => p.modelVersion === version)
            const uniqueLines = Array.from(new Set(versionPCs.map(p => p.lineNumber)))
                .sort((a, b) => a - b)
            setShownLines(uniqueLines)
        } else {
            setShownLines(allLines)
        }
    }

    const handleTargetTypeChange = (val: 'all' | 'version' | 'lineandversion') => {
        setApplyTarget(val)
        setApplyVersion('')
        setApplyLines([])
        setShownLines(allLines)
    }

    // --- Main Deployment Actions ---

    const handleDeploy = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedModel) return

        setIsDeploying(true)
        try {
            // 1. Get Targets (Client Side)
            const targetedPCs = getFilteredTargets()

            if (targetedPCs.length === 0) {
                if (applyTarget === 'version' && !applyVersion) showToast("Please select a version.", 'error')
                else if (applyTarget === 'lineandversion' && applyLines.length === 0) showToast("Please select lines to deploy to.", 'error')
                else showToast("No PCs found matching your criteria.", 'error')

                setIsDeploying(false)
                return
            }

            // 2. Offline Check
            const offline = targetedPCs.filter(p => !p.isOnline)
            setCurrentDeploymentCandidates([...targetedPCs])

            if (offline.length > 0) {
                setOfflineCandidates([...offline])
                setIsDeploying(false)
                // OPEN ALERT VIA URL
                openOfflineAlert();
                return
            }

            // 3. Proceed
            await proceedWithCheck(targetedPCs)

        } catch (err: any) {
            showToast('Error: ' + err.message, 'error')
            setIsDeploying(false)
        }
    }

    const handleProceedOnlineOnly = async () => {
        closeOfflineAlert();
        setIsDeploying(true)

        // Filter from the stored list
        const onlinePCs = currentDeploymentCandidates.filter(p => !!p.isOnline)

        if (onlinePCs.length === 0) {
            showToast("No online PCs availble in the selection.", 'error')
            setIsDeploying(false)
            return
        }

        await proceedWithCheck(onlinePCs)
    }

    const proceedWithCheck = async (targetPCs: FactoryPC[]) => {
        if (!selectedModel) return;
        const onlineIds = targetPCs.filter(p => p.isOnline).map(p => p.pcId)

        try {
            const req: ApplyModelRequest = {
                modelFileId: selectedModel.modelFileId,
                targetType: 'selected',
                selectedPCIds: onlineIds,
                checkOnly: true,
                applyImmediately: true
            }

            const res = await factoryApi.applyModel(req)

            if (res.existingCount > 0) {
                setOverwriteStats({ total: res.totalTargets, existing: res.existingCount })
                setPendingRequest({
                    modelFileId: selectedModel.modelFileId,
                    targetType: 'selected',
                    selectedPCIds: onlineIds,
                    checkOnly: false,
                    applyImmediately: true
                } as any)
                setIsDeploying(false)
                // OPEN CONFIRM VIA URL
                openOverwriteConfirm();
                return
            }

            // Execute
            await executeApply({
                modelFileId: selectedModel.modelFileId,
                targetType: 'selected',
                selectedPCIds: onlineIds,
                checkOnly: false,
                applyImmediately: true,
                forceOverwrite: false
            }, false)

        } catch (err: any) {
            showToast("Check failed: " + err.message, 'error')
            setIsDeploying(false)
        }
    }

    const executeApply = async (req: ApplyModelRequest | null, forceOverwrite: boolean) => {
        setIsDeploying(true)
        if (activePrompt === 'overwrite') closeOverwriteConfirm();

        try {
            const finalReq = req || pendingRequest!
            if (!finalReq) return

            finalReq.forceOverwrite = forceOverwrite
            finalReq.checkOnly = false

            await factoryApi.applyModel(finalReq)

            showToast('Deployment initiated successfully!', 'success')

            // Trigger immediate refresh on Dashboard (no loading animation)
            setTimeout(() => eventBus.emit(EVENTS.REFRESH_DASHBOARD), 500)

            closeDeploy();

        } catch (err: any) { showToast('Deployment failed: ' + err.message, 'error') }
        finally { setIsDeploying(false) }
    }

    // --- Other Handlers ---
    // In your React Component (e.g., ModelLibrary.tsx or a new DownloadModal)

    const handleDownloadFromPC = async (pcId: number, modelName: string) => {
        try {
            // 1. Request the download
            const reqRes = await fetch('/api/ModelLibrary/request-download', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pcId, modelName })
            });

            if (!reqRes.ok) throw new Error("Failed to request download");
            const { requestId } = await reqRes.json();

            // 2. Poll for status
            const pollInterval = setInterval(async () => {
                const statusRes = await fetch(`/api/ModelLibrary/check-status/${requestId}`);
                if (statusRes.ok) {
                    const { status, error } = await statusRes.json();

                    if (status === 'Ready') {
                        clearInterval(pollInterval);
                        // 3. Trigger actual download
                        window.location.href = `/api/ModelLibrary/serve-download/${requestId}`;
                        // Or use a hidden link click for cleaner UX
                    } else if (status === 'Failed') {
                        clearInterval(pollInterval);
                        alert(`Download failed: ${error}`);
                    }
                }
            }, 2000); // Check every 2 seconds

            // Safety timeout (optional)
            setTimeout(() => clearInterval(pollInterval), 60000); // Stop after 1 min

        } catch (error) {
            console.error(error);
            alert("Error initiating download sequence");
        }
    };

    const handleDelete = async () => {
        if (!deleteTargetId) return;

        setIsDeleting(true)
        closeDeleteConfirm();

        try {
            await factoryApi.deleteModel(deleteTargetId)
            loadData()
            showToast('Model deleted successfully', 'success')
        } catch (err) { showToast('Delete failed', 'error') }
        finally { setIsDeleting(false) }
    }

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!uploadFile) return
        setIsUploading(true)
        try {
            await factoryApi.uploadModelToLibrary(
                uploadFile,
                uploadName || uploadFile.name.replace('.zip', ''),
                uploadDesc,
                uploadCategory
            )
            showToast('Model uploaded successfully!', 'success')
            closeUpload();
            setUploadFile(null); setUploadName(''); setUploadDesc('');
            loadData()
        } catch (err) { showToast('Upload failed', 'error') }
        finally { setIsUploading(false) }
    }

    const handleDownload = async (model: ModelFile) => {
        setIsDownloading(true)
        try {
            const blob = await factoryApi.downloadModelTemplate(model.modelFileId)

            // Check if we actually got data
            if (!blob || blob.size === 0) {
                throw new Error("File is empty");
            }

            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')

            // FIX: Ensure the element is hidden and appended correctly
            a.style.display = 'none'
            a.href = url

            // FIX: Ensure there is always a filename (fallback to modelName.zip)
            a.download = model.fileName || `${model.modelName}.zip`

            document.body.appendChild(a)
            a.click()

            // FIX: Delay cleanup slightly to ensure the click event processes
            setTimeout(() => {
                document.body.removeChild(a)
                window.URL.revokeObjectURL(url)
            }, 100)

            showToast("Download started", 'success')
        } catch (err: any) {
            console.error("Download Error:", err);
            showToast('Download failed: ' + (err.message || "Server Error"), 'error')
        }
        finally { setIsDownloading(false) }
    }

    return (
        <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* Header */}
            <div className="dashboard-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <HardDrive size={16} style={{ color: 'var(--primary)', flexShrink: 0 }} />
                            <span>Model Library</span>
                        </h1>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                            {models.length} {models.length === 1 ? 'model' : 'models'}
                        </div>
                    </div>
                    <button className="btn btn-primary" onClick={openUpload} style={{ fontSize: '0.85rem', padding: '0.5rem 0.875rem' }}>
                        <Upload size={15} /> Upload Model
                    </button>
                </div>
            </div>

            {/* Content List */}
            <div className="dashboard-scroll-area" style={{ position: 'relative' }}>
                {loading && <LoadingOverlay message="Loading library..." />}
                {isDeleting && <LoadingOverlay message="Deleting model..." />}
                {isDownloading && <LoadingOverlay message="Downloading model..." />}

                {!loading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {models.map(m => (
                            <div key={m.modelFileId} className="card" style={{ display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem' }}>
                                <div style={{ width: 48, height: 48, background: 'linear-gradient(135deg, var(--bg-hover), var(--bg-panel))', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--border)' }}>
                                    <Package size={24} color="var(--primary)" />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem' }}>
                                        <h3 style={{ fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>{m.modelName}</h3>
                                        {m.category && <span className="badge badge-neutral" style={{ fontSize: '0.6rem' }}>{m.category}</span>}
                                    </div>
                                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.375rem', margin: 0 }}>{m.description || 'No description provided.'}</p>
                                    <div className="text-mono" style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>{m.fileName} • {(m.fileSize / 1024 / 1024).toFixed(2)} MB • {new Date(m.uploadedDate).toLocaleDateString()}</div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                    <button className="btn btn-success" onClick={() => openDeploy(m.modelFileId)} style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }} disabled={isDeleting || isDownloading}>
                                        <Rocket size={14} /> Deploy
                                    </button>
                                    <button className="btn btn-secondary btn-icon" onClick={() => handleDownload(m)} title="Download" style={{ padding: '0.4rem' }} disabled={isDeleting || isDownloading}>
                                        <Download size={16} />
                                    </button>
                                    <button className="btn btn-danger btn-icon" onClick={() => openDeleteConfirm(m.modelFileId)} title="Delete" style={{ padding: '0.4rem' }} disabled={isDeleting || isDownloading}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {models.length === 0 && (
                            <div style={{ padding: '3rem', border: '2px dashed var(--border)', borderRadius: 'var(--radius-lg)', textAlign: 'center', color: 'var(--text-dim)', background: 'var(--bg-hover)' }}>
                                <Package size={48} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                                <p style={{ margin: 0, fontSize: '0.95rem' }}>No models found. Upload a .zip file to get started.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* URL-DRIVEN MODALS (Back button safe) */}

            {/* 1. Upload Modal */}
            {activeModal === 'upload' && (
                <div className="modal-overlay" onClick={closeUpload}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', position: 'relative' }}>
                        {isUploading && <LoadingOverlay message="Uploading model..." />}
                        <div className="modal-header">
                            <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Upload Model</h3>
                            <button onClick={closeUpload} className="btn btn-secondary btn-icon"><X size={18} /></button>
                        </div>
                        <form onSubmit={handleUpload} className="modal-body">
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>ZIP File *</label>
                                <input type="file" accept=".zip" required className="input-field" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Category</label>
                                <input className="input-field" value={uploadCategory} onChange={e => setUploadCategory(e.target.value)} placeholder="e.g. Production..." />
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Description</label>
                                <input className="input-field" value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} placeholder="Brief description..." />
                            </div>
                            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isUploading}>
                                {isUploading ? 'Uploading...' : 'Upload Model'}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {/* 2. Deploy Modal (Top Layer) */}
            {activeModal === 'deploy' && selectedModel && (
                <div className="modal-overlay" onClick={closeDeploy} style={{ zIndex: 1000 }}>
                    {!activePrompt && (
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', position: 'relative' }}>
                            {isDeploying && <LoadingOverlay message="Deploying model..." />}
                            <div className="modal-header">
                                <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Deploy "{selectedModel.modelName}"</h3>
                                <button onClick={closeDeploy} className="btn btn-secondary btn-icon"><X size={18} /></button>
                            </div>
                            <form onSubmit={handleDeploy} className="modal-body">
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Target Scope</label>
                                    <select
                                        className="input-field"
                                        value={applyTarget}
                                        onChange={e => handleTargetTypeChange(e.target.value as any)}
                                    >
                                        <option value="all">All PCs</option>
                                        <option value="version">Target Specific Version</option>
                                        <option value="lineandversion">Target Lines on Version</option>
                                    </select>
                                </div>

                                {(applyTarget === 'version' || applyTarget === 'lineandversion') && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Model Version</label>
                                        <select
                                            className="input-field"
                                            required
                                            value={applyVersion}
                                            onChange={e => handleVersionChange(e.target.value)}
                                        >
                                            <option value="">Select Version...</option>
                                            {versions.map(v => <option key={v} value={v}>{v}</option>)}
                                        </select>
                                    </div>
                                )}

                                {(applyTarget === 'lineandversion') && (
                                    <div style={{ marginBottom: '1rem' }}>
                                        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                                            Select Lines {applyVersion && `(on v${applyVersion})`}
                                        </label>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>
                                            {(shownLines && shownLines.length > 0) ? shownLines.map(ln => {
                                                const isSelected = applyLines.includes(ln)
                                                return (
                                                    <div
                                                        key={ln}
                                                        onClick={() => setApplyLines(prev => isSelected ? prev.filter(x => x !== ln) : [...prev, ln])}
                                                        style={{
                                                            padding: '0.35rem 0.85rem',
                                                            borderRadius: '999px',
                                                            background: isSelected ? 'var(--primary)' : 'var(--bg-hover)',
                                                            color: isSelected ? 'white' : 'var(--text-main)',
                                                            fontSize: '0.85rem',
                                                            cursor: 'pointer',
                                                            border: isSelected ? '1px solid var(--primary)' : '1px solid var(--border)',
                                                            transition: 'all 0.2s',
                                                            fontWeight: 500
                                                        }}
                                                    >
                                                        Line {ln}
                                                    </div>
                                                )
                                            }) : (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontStyle: 'italic', padding: '0.5rem' }}>
                                                    {applyVersion ? 'No lines found for this version.' : 'Select a version to see available lines.'}
                                                </div>
                                            )}
                                        </div>
                                        {applyTarget === 'lineandversion' && applyLines.length === 0 && shownLines.length > 0 && (
                                            <div style={{ fontSize: '0.75rem', color: 'var(--danger)', marginTop: '0.5rem' }}>Please select at least one line</div>
                                        )}
                                    </div>
                                )}

                                <div style={{ background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '0.875rem', borderRadius: 'var(--radius-md)', marginBottom: '1.5rem' }}>
                                    <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.8rem', color: 'var(--text-main)', alignItems: 'flex-start' }}>
                                        <Rocket size={16} color="var(--success)" style={{ flexShrink: 0, marginTop: '0.125rem' }} />
                                        <span>Smart Deployment: Checks for existing models and optimizes transfer.</span>
                                    </div>
                                </div>

                                <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isDeploying || (applyTarget === 'lineandversion' && applyLines.length === 0)}>
                                    {isDeploying ? 'Checking Targets...' : 'Proceed to Deploy'}
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Nested Overwrite Confirm (Layer 2) */}
                    {activePrompt === 'overwrite' && (
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px', zIndex: 1002 }}>
                            <div className="modal-header">
                                <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Model Conflict Detected</h3>
                                <button onClick={closeOverwriteConfirm} className="btn btn-secondary btn-icon"><X size={18} /></button>
                            </div>
                            <div className="modal-body">
                                <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                    <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(234, 179, 8, 0.1)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem' }}>
                                        <AlertTriangle size={24} />
                                    </div>
                                    <p style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>
                                        This model is already present on <strong>{overwriteStats.existing}</strong> of {overwriteStats.total} target PCs.
                                    </p>
                                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>How would you like to proceed?</p>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                    <button className="btn btn-secondary" style={{ justifyContent: 'center', padding: '1rem' }} onClick={() => pendingRequest && executeApply(pendingRequest, false)} disabled={isDeploying}>
                                        Skip Existing (Recommended)
                                        <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-dim)', fontWeight: 400 }}>Only deploy to PCs missing the model</span>
                                    </button>
                                    <button className="btn btn-primary" style={{ justifyContent: 'center', padding: '1rem' }} onClick={() => pendingRequest && executeApply(pendingRequest, true)} disabled={isDeploying}>
                                        Force Overwrite All
                                        <span style={{ display: 'block', fontSize: '0.7rem', opacity: 0.8, fontWeight: 400 }}>Re-upload to all targets</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* 3. Offline Alert Modal (URL Driven) */}
            {activeAlert === 'offline' && (
                <OfflineAlertModal
                    offlineCandidates={offlineCandidates}
                    onCancel={closeOfflineAlert}
                    onProceedOnlineOnly={handleProceedOnlineOnly}
                    actionLabel="Run on Online Models"
                />
            )}

            {/* 4. Delete Confirm Modal */}
            {activePrompt === 'confirm_delete' && (
                <ConfirmModal
                    title="Confirm Deletion"
                    message="Are you sure you want to delete this model? This cannot be undone."
                    onConfirm={handleDelete}
                    onCancel={closeDeleteConfirm}
                />
            )}
        </div>
    )
}