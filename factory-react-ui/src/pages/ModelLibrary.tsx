import { useEffect, useState, useRef, useMemo } from 'react'
import { Package, Upload, Trash2, Rocket, Download, X, HardDrive, AlertTriangle, Edit, Clock, FileText, ChevronRight, ChevronDown, Plus, Minus, Eye } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom';
import NotFound from './NotFound';

import { factoryApi } from '../services/api'
import type { ModelFile, ApplyModelRequest, FactoryPC } from '../types'
import { LoadingOverlay } from '../components/LoadingOverlay'
import { Toast } from '../components/Toast'
import { ConfirmModal } from '../components/ConfirmModal'
import { OfflineAlertModal } from '../components/OfflineAlertModal'
import { eventBus, EVENTS } from '../utils/eventBus'

// --- HELPER: DIFF ALGORITHM ---
interface DiffLine { type: 'same' | 'added' | 'removed'; content: string }

const diffLines = (text1: string, text2: string): { original: DiffLine[], modified: DiffLine[] } => {
    const lines1 = (text1 || '').replace(/\r\n/g, "\n").split('\n');
    const lines2 = (text2 || '').replace(/\r\n/g, "\n").split('\n');
    const n = lines1.length, m = lines2.length;
    const dp = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (lines1[i - 1] === lines2[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
            else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    let i = n, j = m;
    const rawOps = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && lines1[i - 1] === lines2[j - 1]) { rawOps.push({ type: 'same', line: lines1[i - 1] }); i--; j--; }
        else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) { rawOps.push({ type: 'added', line: lines2[j - 1] }); j--; }
        else { rawOps.push({ type: 'removed', line: lines1[i - 1] }); i--; }
    }
    rawOps.reverse();

    const originalDiff: DiffLine[] = [], modifiedDiff: DiffLine[] = [];
    let bufferDel: string[] = [], bufferAdd: string[] = [];
    const flush = () => {
        const common = Math.min(bufferDel.length, bufferAdd.length);
        for (let k = 0; k < common; k++) { originalDiff.push({ type: 'removed', content: bufferDel[k] }); modifiedDiff.push({ type: 'added', content: bufferAdd[k] }); }
        for (let k = common; k < bufferDel.length; k++) { originalDiff.push({ type: 'removed', content: bufferDel[k] }); modifiedDiff.push({ type: 'removed', content: '' }); }
        for (let k = common; k < bufferAdd.length; k++) { originalDiff.push({ type: 'added', content: '' }); modifiedDiff.push({ type: 'added', content: bufferAdd[k] }); }
        bufferDel = []; bufferAdd = [];
    }
    rawOps.forEach(op => {
        if (op.type === 'same') { flush(); originalDiff.push({ type: 'same', content: op.line }); modifiedDiff.push({ type: 'same', content: op.line }); }
        else if (op.type === 'removed') bufferDel.push(op.line);
        else bufferAdd.push(op.line);
    });
    flush();
    return { original: originalDiff, modified: modifiedDiff };
}

// --- COMPONENT: DIFF VIEWER WITH SYNC SCROLL ---
const DiffViewer = ({ oldContent, newContent }: { oldContent: string, newContent: string }) => {
    const { original, modified } = useMemo(() => diffLines(oldContent, newContent), [oldContent, newContent]);

    // Refs for scrolling elements
    const originalRef = useRef<HTMLDivElement>(null);
    const modifiedRef = useRef<HTMLDivElement>(null);

    // Synchronized Scrolling Handler
    const handleScroll = (source: 'original' | 'modified') => {
        const src = source === 'original' ? originalRef.current : modifiedRef.current;
        const dest = source === 'original' ? modifiedRef.current : originalRef.current;
        if (src && dest) {
            dest.scrollTop = src.scrollTop;
            dest.scrollLeft = src.scrollLeft;
        }
    };

    const renderLine = (line: DiffLine, i: number, isLeft: boolean) => {
        let bg = 'transparent', color = 'inherit', Icon = null;
        if (isLeft) {
            if (line.type === 'removed') { bg = 'rgba(239, 68, 68, 0.15)'; Icon = Minus; }
        } else {
            if (line.type === 'added') { bg = 'rgba(34, 197, 94, 0.15)'; Icon = Plus; }
        }

        // Spacer check
        if ((isLeft && line.type === 'added') || (!isLeft && line.type === 'removed' && line.content === '')) {
            return <div key={i} style={{ height: '24px', background: 'rgba(0,0,0,0.05)', borderBottom: '1px solid transparent' }} />
        }

        return (
            <div key={i} style={{ display: 'flex', backgroundColor: bg, minHeight: '24px', fontFamily: 'Consolas, monospace', fontSize: '12px', lineHeight: '2' }}>
                <div style={{ width: '24px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRight: '1px solid var(--border)', color: Icon === Plus ? '#16a34a' : (Icon === Minus ? '#dc2626' : 'transparent') }}>
                    {Icon && <Icon size={10} />}
                </div>
                <div style={{ padding: '0 4px', whiteSpace: 'pre', overflowX: 'auto', flex: 1 }}>{line.content || ' '}</div>
            </div>
        )
    }

    return (
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: '4px', overflow: 'hidden', height: '400px' }}>
            <div
                ref={originalRef}
                onScroll={() => handleScroll('original')}
                style={{ flex: 1, overflow: 'auto', borderRight: '1px solid var(--border)', background: 'var(--bg-panel)' }}
            >
                <div style={{ padding: '4px', background: 'var(--bg-hover)', fontSize: '11px', fontWeight: 'bold', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0 }}>ORIGINAL</div>
                {original.map((l, i) => renderLine(l, i, true))}
            </div>
            <div
                ref={modifiedRef}
                onScroll={() => handleScroll('modified')}
                style={{ flex: 1, overflow: 'auto', background: 'var(--bg-app)' }}
            >
                <div style={{ padding: '4px', background: 'var(--bg-hover)', fontSize: '11px', fontWeight: 'bold', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0 }}>MODIFIED</div>
                {modified.map((l, i) => renderLine(l, i, false))}
            </div>
        </div>
    )
}

interface ChangeLogEntry {
    Path: string
    ChangeType: string
    OldContent: string
    NewContent: string
}

interface HistoryItem {
    logId: number
    timestamp: string
    details: string
    parsed?: { Summary: string, Changes: ChangeLogEntry[] }
}

export default function ModelLibrary() {
    const [searchParams] = useSearchParams();
    if (Array.from(searchParams.keys()).length > 0) return <NotFound />;

    const navigate = useNavigate()
    const [models, setModels] = useState<ModelFile[]>([])
    const [versions, setVersions] = useState<string[]>([])
    const [allLines, setAllLines] = useState<number[]>([])
    const [allPCs, setAllPCs] = useState<FactoryPC[]>([])
    const [shownLines, setShownLines] = useState<number[]>([])
    const [loading, setLoading] = useState(true)

    // Modal States
    const [showUpload, setShowUpload] = useState(false)
    const [showDeploy, setShowDeploy] = useState(false)
    const [showHistory, setShowHistory] = useState(false)
    const [selectedModel, setSelectedModel] = useState<ModelFile | null>(null)

    // History
    const [historyLogs, setHistoryLogs] = useState<HistoryItem[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [viewingDiff, setViewingDiff] = useState<ChangeLogEntry | null>(null)

    // ... (Keep existing states)
    const [uploadFile, setUploadFile] = useState<File | null>(null)
    const [uploadName, setUploadName] = useState('')
    const [uploadDesc, setUploadDesc] = useState('')
    const [uploadCategory, setUploadCategory] = useState('')
    const [isUploading, setIsUploading] = useState(false)
    const [applyTarget, setApplyTarget] = useState<'all' | 'version' | 'lineandversion'>('all')
    const [applyVersion, setApplyVersion] = useState('')
    const [applyLines, setApplyLines] = useState<number[]>([])
    const [isDeploying, setIsDeploying] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [showOfflineAlert, setShowOfflineAlert] = useState(false)
    const [offlineCandidates, setOfflineCandidates] = useState<FactoryPC[]>([])
    const [currentDeploymentCandidates, setCurrentDeploymentCandidates] = useState<FactoryPC[]>([])
    const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false)
    const [overwriteStats, setOverwriteStats] = useState({ total: 0, existing: 0 })
    const [pendingRequest, setPendingRequest] = useState<ApplyModelRequest | null>(null)
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' | 'info' } | null>(null)
    const [confirmModal, setConfirmModal] = useState<{ title: string, message: string, onConfirm: () => void } | null>(null)
    const toastTimer = useRef<any>(null)

    const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current)
        setToast({ msg, type })
        toastTimer.current = setTimeout(() => setToast(null), 4000)
    }

    const openConfirm = (title: string, message: string, onConfirm: () => void) => {
        setConfirmModal({ title, message, onConfirm })
    }

    useEffect(() => { loadData() }, [])

    const loadData = async () => {
        setLoading(true)
        try {
            const [m, v, l, pcsRes] = await Promise.all([
                factoryApi.getLibraryModels(),
                factoryApi.getVersions(),
                factoryApi.getLines(),
                factoryApi.getPCs()
            ])
            setModels(m); setVersions(v); setAllLines(l); setShownLines(l);
            let flatList: FactoryPC[] = []
            if (pcsRes && pcsRes.lines && Array.isArray(pcsRes.lines)) {
                pcsRes.lines.forEach((lineGroup: any) => { if (Array.isArray(lineGroup.pcs)) flatList.push(...lineGroup.pcs) })
            } else if (Array.isArray(pcsRes)) flatList = pcsRes
            setAllPCs(flatList)
        } catch (e) { console.error("Failed to load data", e); showToast("Failed to load content", 'error') }
        finally { setLoading(false) }
    }

    const handleViewHistory = async (model: ModelFile) => {
        setSelectedModel(model)
        setShowHistory(true)
        setLoadingHistory(true)
        setViewingDiff(null)
        try {
            const logs = await factoryApi.getModelHistory(model.modelFileId)
            const parsedLogs = logs.map((l: any) => {
                let parsed = null
                const cleanDetails = l.details ? l.details.split('\n[ModelID:')[0] : ''
                try {
                    parsed = JSON.parse(cleanDetails)
                } catch {
                    parsed = { Summary: cleanDetails, Changes: [] }
                }
                return { ...l, details: cleanDetails, parsed }
            })
            setHistoryLogs(parsedLogs)
        } catch (e) { showToast("Failed to load history", 'error') }
        finally { setLoadingHistory(false) }
    }

    // ... (Keep existing handlers)
    const getFilteredTargets = (): FactoryPC[] => {
        let targets = [...allPCs]
        if (applyTarget === 'version') { if (!applyVersion) return []; targets = targets.filter(p => p.modelVersion === applyVersion) }
        else if (applyTarget === 'lineandversion') { if (!applyVersion) return []; targets = targets.filter(p => p.modelVersion === applyVersion); if (applyLines.length > 0) targets = targets.filter(p => applyLines.includes(p.lineNumber)); else return [] }
        return targets
    }
    const handleVersionChange = (version: string) => { setApplyVersion(version); setApplyLines([]); if (version) { const versionPCs = allPCs.filter(p => p.modelVersion === version); const uniqueLines = Array.from(new Set(versionPCs.map(p => p.lineNumber))).sort((a, b) => a - b); setShownLines(uniqueLines) } else { setShownLines(allLines) } }
    const handleTargetTypeChange = (val: 'all' | 'version' | 'lineandversion') => { setApplyTarget(val); setApplyVersion(''); setApplyLines([]); setShownLines(allLines) }
    const handleDeploy = async (e: React.FormEvent) => { e.preventDefault(); if (!selectedModel) return; setIsDeploying(true); try { const targetedPCs = getFilteredTargets(); if (targetedPCs.length === 0) { if (applyTarget === 'version' && !applyVersion) showToast("Please select a version.", 'error'); else if (applyTarget === 'lineandversion' && applyLines.length === 0) showToast("Please select lines to deploy to.", 'error'); else showToast("No PCs found matching your criteria.", 'error'); setIsDeploying(false); return; } const offline = targetedPCs.filter(p => !p.isOnline); setCurrentDeploymentCandidates([...targetedPCs]); if (offline.length > 0) { setOfflineCandidates([...offline]); setShowOfflineAlert(true); setIsDeploying(false); return; } await proceedWithCheck(targetedPCs) } catch (err: any) { showToast('Error: ' + err.message, 'error'); setIsDeploying(false) } }
    const handleProceedOnlineOnly = async () => { setShowOfflineAlert(false); setIsDeploying(true); const onlinePCs = currentDeploymentCandidates.filter(p => !!p.isOnline); if (onlinePCs.length === 0) { showToast("No online PCs availble in the selection.", 'error'); setIsDeploying(false); return; } await proceedWithCheck(onlinePCs) }
    const proceedWithCheck = async (targetPCs: FactoryPC[]) => { const onlineIds = targetPCs.filter(p => p.isOnline).map(p => p.pcId); try { const req: ApplyModelRequest = { modelFileId: selectedModel!.modelFileId, targetType: 'selected', selectedPCIds: onlineIds, checkOnly: true, applyImmediately: true }; const res = await factoryApi.applyModel(req); if (res.existingCount > 0) { setOverwriteStats({ total: res.totalTargets, existing: res.existingCount }); setPendingRequest({ modelFileId: selectedModel!.modelFileId, targetType: 'selected', selectedPCIds: onlineIds, checkOnly: false, applyImmediately: true } as any); setShowOverwriteConfirm(true); setIsDeploying(false); return; } await executeApply({ modelFileId: selectedModel!.modelFileId, targetType: 'selected', selectedPCIds: onlineIds, checkOnly: false, applyImmediately: true, forceOverwrite: false }, false) } catch (err: any) { showToast("Check failed: " + err.message, 'error'); setIsDeploying(false) } }
    const executeApply = async (req: ApplyModelRequest | null, forceOverwrite: boolean) => { setIsDeploying(true); try { const finalReq = req || pendingRequest!; if (!finalReq) return; finalReq.forceOverwrite = forceOverwrite; finalReq.checkOnly = false; await factoryApi.applyModel(finalReq); showToast('Deployment initiated successfully!', 'success'); setTimeout(() => eventBus.emit(EVENTS.REFRESH_DASHBOARD), 500); handleCloseDeploy() } catch (err: any) { showToast('Deployment failed: ' + err.message, 'error') } finally { setIsDeploying(false) } }
    const handleCloseDeploy = () => { setShowDeploy(false); setShowOverwriteConfirm(false); setSelectedModel(null); setApplyLines([]); setApplyVersion(''); setApplyTarget('all'); setOfflineCandidates([]); setCurrentDeploymentCandidates([]); setPendingRequest(null) }
    const handleDownload = async (model: ModelFile) => { setIsDownloading(true); try { const blob = await factoryApi.downloadModelTemplate(model.modelFileId); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = model.fileName; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); showToast("Download started", 'success') } catch (err) { showToast('Download failed', 'error') } finally { setIsDownloading(false) } }
    const handleDelete = async (id: number) => { openConfirm("Confirm Deletion", "Are you sure you want to delete this model? This cannot be undone.", async () => { setIsDeleting(true); try { await factoryApi.deleteModel(id); loadData(); showToast('Model deleted successfully', 'success') } catch (err) { showToast('Delete failed', 'error') } finally { setIsDeleting(false) } }) }
    const handleUpload = async (e: React.FormEvent) => { e.preventDefault(); if (!uploadFile) return; setIsUploading(true); try { await factoryApi.uploadModelToLibrary(uploadFile, uploadName || uploadFile.name.replace('.zip', ''), uploadDesc, uploadCategory); showToast('Model uploaded successfully!', 'success'); setShowUpload(false); setUploadFile(null); setUploadName(''); setUploadDesc(''); loadData() } catch (err) { showToast('Upload failed', 'error') } finally { setIsUploading(false) } }

    return (
        <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

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
                    <button className="btn btn-primary" onClick={() => setShowUpload(true)} style={{ fontSize: '0.85rem', padding: '0.5rem 0.875rem' }}>
                        <Upload size={15} /> Upload Model
                    </button>
                </div>
            </div>

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
                                    <div className="text-mono" style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
                                        <span>{m.fileName} • {(m.fileSize / 1024 / 1024).toFixed(2)} MB</span>
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <Clock size={10} /> Last Modified: {new Date(m.uploadedDate).toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                    <button className="btn btn-success" onClick={() => { setSelectedModel(m); setShowDeploy(true); }} style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }} disabled={isDeleting || isDownloading}>
                                        <Rocket size={14} /> Deploy
                                    </button>

                                    <button
                                        className="btn btn-secondary"
                                        onClick={() => handleViewHistory(m)}
                                        title="View Change History"
                                        style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                                    >
                                        <Clock size={16} />History
                                    </button>

                                    <button className="btn btn-secondary" onClick={() => navigate(`/models/edit/${m.modelFileId}`)} style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }} disabled={isDeleting || isDownloading}>
                                        <Edit size={14} /> Edit
                                    </button>

                                    <button className="btn btn-secondary btn-icon" onClick={() => handleDownload(m)} title="Download" style={{ padding: '0.4rem' }} disabled={isDeleting || isDownloading}>
                                        <Download size={16} />
                                    </button>
                                    <button className="btn btn-danger btn-icon" onClick={() => handleDelete(m.modelFileId)} title="Delete" style={{ padding: '0.4rem' }} disabled={isDeleting || isDownloading}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* History Modal */}
            {showHistory && selectedModel && (
                <div className="modal-overlay" onClick={() => setShowHistory(false)} style={{ zIndex: 1200 }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '800px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header">
                            <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Change History: {selectedModel.modelName}</h3>
                            <button onClick={() => setShowHistory(false)} className="btn btn-secondary btn-icon"><X size={18} /></button>
                        </div>
                        <div className="modal-body" style={{ overflowY: 'auto', padding: '0', flex: 1, background: 'var(--bg-app)' }}>
                            {loadingHistory ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>Loading history...</div>
                            ) : historyLogs.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>No history available.</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {historyLogs.map((log, i) => (
                                        <div key={log.logId} style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                                            <div style={{ padding: '1rem', display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
                                                <div style={{ width: '120px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                                                        {log.parsed?.Summary || "Update"}
                                                    </div>

                                                    {log.parsed?.Changes && log.parsed.Changes.length > 0 ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            {log.parsed.Changes.map((change, idx) => (
                                                                <div key={idx} style={{
                                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                                    padding: '6px 10px', background: 'var(--bg-app)', borderRadius: '4px', border: '1px solid var(--border)'
                                                                }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                        <FileText size={14} color="var(--primary)" />
                                                                        <span style={{ fontSize: '0.85rem', fontFamily: 'monospace' }}>{change.Path}</span>
                                                                        <span className="badge badge-neutral" style={{ fontSize: '0.65rem' }}>{change.ChangeType}</span>
                                                                    </div>
                                                                    {change.ChangeType === 'MODIFIED' && (
                                                                        <button
                                                                            className="btn btn-secondary btn-icon"
                                                                            style={{ height: '24px', width: '24px' }}
                                                                            onClick={() => setViewingDiff(change)}
                                                                            title="View Diff"
                                                                        >
                                                                            <Eye size={14} />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                                                            {log.parsed?.Summary || log.details}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* DIFF VIEWER SUB-MODAL */}
            {viewingDiff && (
                <div className="modal-overlay" onClick={() => setViewingDiff(null)} style={{ zIndex: 1300 }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '900px', width: '90vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header">
                            <h3 style={{ fontSize: '1rem', margin: 0, fontFamily: 'monospace' }}>Diff: {viewingDiff.Path}</h3>
                            <button onClick={() => setViewingDiff(null)} className="btn btn-secondary btn-icon"><X size={18} /></button>
                        </div>
                        <div className="modal-body" style={{ flex: 1, overflow: 'hidden', padding: '10px' }}>
                            <DiffViewer oldContent={viewingDiff.OldContent} newContent={viewingDiff.NewContent} />
                        </div>
                    </div>
                </div>
            )}

            {/* ... (Existing Modals) ... */}
            {showUpload && (
                <div className="modal-overlay" onClick={() => setShowUpload(false)}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', position: 'relative' }}>
                        {isUploading && <LoadingOverlay message="Uploading model..." />}
                        <div className="modal-header">
                            <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Upload Model</h3>
                            <button onClick={() => setShowUpload(false)} className="btn btn-secondary btn-icon"><X size={18} /></button>
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

            {showDeploy && selectedModel && (
                <div className="modal-overlay" onClick={handleCloseDeploy}>
                    {!showOverwriteConfirm ? (
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', position: 'relative' }}>
                            {isDeploying && <LoadingOverlay message="Deploying model..." />}
                            <div className="modal-header">
                                <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Deploy "{selectedModel.modelName}"</h3>
                                <button onClick={handleCloseDeploy} className="btn btn-secondary btn-icon"><X size={18} /></button>
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
                    ) : (
                        <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                            <div className="modal-header">
                                <h3 style={{ fontSize: '1.05rem', margin: 0 }}>Model Conflict Detected</h3>
                                <button onClick={() => setShowOverwriteConfirm(false)} className="btn btn-secondary btn-icon"><X size={18} /></button>
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

            {/* Offline Alert Modal */}
            {showOfflineAlert && (
                <OfflineAlertModal
                    offlineCandidates={offlineCandidates}
                    onCancel={() => setShowOfflineAlert(false)}
                    onProceedOnlineOnly={handleProceedOnlineOnly}
                    actionLabel="Run on Online Models"
                />
            )}

            {/* Confirm Modal */}
            {confirmModal && (
                <ConfirmModal
                    title={confirmModal.title}
                    message={confirmModal.message}
                    onConfirm={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                    onCancel={() => setConfirmModal(null)}
                />
            )}
        </div>
    )
}