import { useEffect, useState, useRef, useMemo } from 'react'
import { Package, Upload, Trash2, Rocket, Download, X, HardDrive, Edit, Clock, FileText, Plus, Minus, Eye } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom';
import NotFound from './NotFound';

import { factoryApi } from '../services/api'
import type { ModelFile, ApplyModelRequest, FactoryPC } from '../types'
import { LoadingOverlay } from '../components/LoadingOverlay'
import { Toast } from '../components/Toast'
import { ConfirmModal } from '../components/ConfirmModal'
import { OfflineAlertModal } from '../components/OfflineAlertModal'
import { eventBus, EVENTS } from '../utils/eventBus'

// --- Prism.js for Syntax Highlighting ---
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-ini';

const highlightCode = (code: string, path: string) => {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    let grammar = languages.clike;
    if (ext === 'json') grammar = languages.json;
    else if (ext === 'html' || ext === 'xml' || ext === 'svg') grammar = languages.markup;
    else if (ext === 'ini' || ext === 'conf' || ext === 'config' || ext === 'cfg') grammar = languages.ini;
    return highlight(code || '', grammar, ext);
}
// --- SHARED DIFF LOGIC START (Updated for .ini support) ---
interface DiffLine { type: 'same' | 'added' | 'removed'; content: string }
interface DiffWord { type: 'same' | 'added' | 'removed'; value: string }

const diffWords = (text1: string, text2: string): DiffWord[] => {
    if (!text1) text1 = ""; if (!text2) text2 = "";
    // Split on non-word characters to handle symbols like =, ;, [, ]
    const words1 = text1.split(/([^\w]+)/);
    const words2 = text2.split(/([^\w]+)/);

    const n = words1.length; const m = words2.length;
    const dp = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) { for (let j = 1; j <= m; j++) { if (words1[i - 1] === words2[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1; else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]); } }

    let i = n, j = m; const parts: DiffWord[] = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && words1[i - 1] === words2[j - 1]) { parts.unshift({ type: 'same', value: words1[i - 1] }); i--; j--; }
        else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) { parts.unshift({ type: 'added', value: words2[j - 1] }); j--; }
        else { parts.unshift({ type: 'removed', value: words1[i - 1] }); i--; }
    }
    return parts;
}

const diffLines = (text1: string, text2: string): { original: DiffLine[], modified: DiffLine[] } => {
    const lines1 = (text1 || '').replace(/\r\n/g, "\n").split('\n');
    const lines2 = (text2 || '').replace(/\r\n/g, "\n").split('\n');
    const n = lines1.length, m = lines2.length;
    const dp = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) { for (let j = 1; j <= m; j++) { if (lines1[i - 1] === lines2[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1; else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]); } }

    let i = n, j = m; const rawOps = [];
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


const DiffViewer = ({ oldContent, newContent, filePath }: { oldContent: string, newContent: string, filePath: string }) => {
    const { original, modified } = useMemo(() => diffLines(oldContent, newContent), [oldContent, newContent]);
    const originalRef = useRef<HTMLDivElement>(null);
    const modifiedRef = useRef<HTMLDivElement>(null);

    const handleScroll = (source: 'original' | 'modified') => {
        const src = source === 'original' ? originalRef.current : modifiedRef.current;
        const dest = source === 'original' ? modifiedRef.current : originalRef.current;
        if (src && dest) {
            dest.scrollTop = src.scrollTop;
            dest.scrollLeft = src.scrollLeft;
        }
    }

    // Render full diff line with line number inline (matching ModelEditor's DiffLineComponent)
    const renderDiffLine = (line: DiffLine, i: number, lineNumber: number, isLeftPane: boolean, correspondingLineContent?: string) => {
        const isSpacer = (isLeftPane && line.type === 'added') || (!isLeftPane && line.type === 'removed' && line.content === '');

        if (isSpacer) {
            return (
                <div key={i} className="diff-line spacer">
                    <div className="diff-line-number" />
                    <div className="diff-line-gutter" />
                    <div className="diff-line-content" />
                </div>
            );
        }

        const lineClass = line.type === 'same' ? 'same' : (isLeftPane ? (line.type === 'removed' ? 'removed' : '') : (line.type === 'added' ? 'added' : ''));

        let renderParts: { type: 'same' | 'highlight', value: string }[] = [{ type: 'same', value: line.content }];

        if (correspondingLineContent !== undefined && correspondingLineContent !== null && correspondingLineContent !== '') {
            const leftText = isLeftPane ? line.content : correspondingLineContent;
            const rightText = isLeftPane ? correspondingLineContent : line.content;
            const rawDiffs = diffWords(leftText, rightText);
            const hasCommon = rawDiffs.some(p => p.type === 'same' && p.value.trim() !== '');

            if (hasCommon) {
                const filtered = isLeftPane
                    ? rawDiffs.filter(p => p.type !== 'added')
                    : rawDiffs.filter(p => p.type !== 'removed');

                renderParts = [];
                filtered.forEach(p => {
                    const isHighlight = (isLeftPane && p.type === 'removed') || (!isLeftPane && p.type === 'added');
                    const targetType = isHighlight ? 'highlight' : 'same';
                    const last = renderParts[renderParts.length - 1];
                    if (last && last.type === targetType) {
                        last.value += p.value;
                    } else {
                        renderParts.push({ type: targetType, value: p.value });
                    }
                });
            }
        }

        return (
            <div key={i} className={`diff-line ${lineClass}`}>
                {/* Line Number */}
                <div className="diff-line-number">{lineNumber}</div>
                {/* Gutter Icon */}
                <div className="diff-line-gutter">
                    {line.type === 'removed' && isLeftPane && <Minus size={10} strokeWidth={3} />}
                    {line.type === 'added' && !isLeftPane && <Plus size={10} strokeWidth={3} />}
                </div>
                {/* Content */}
                <div className="diff-line-content">
                    {renderParts.map((part, idx) => (
                        <span
                            key={idx}
                            className={part.type === 'highlight' ? `diff-highlight ${isLeftPane ? 'removed' : 'added'}` : ''}
                            dangerouslySetInnerHTML={{ __html: highlightCode(part.value, filePath) }}
                        />
                    ))}
                    {renderParts.length === 0 && ' '}
                </div>
            </div>
        );
    };

    // Calculate line numbers (for non-spacer lines)
    let origLineNum = 0;
    let modLineNum = 0;

    return (
        <div className="diff-container" style={{ height: '100%', minHeight: '500px' }}>
            {/* Original Pane */}
            <div className="diff-pane original">
                <div className="diff-pane-header">Original</div>
                <div className="diff-pane-body">
                    <div
                        ref={originalRef}
                        className="diff-pane-content"
                        onScroll={() => handleScroll('original')}
                    >
                        <div className="diff-content-wrapper">
                            {original.map((line, i) => {
                                const isSpacer = line.type === 'added';
                                if (!isSpacer) origLineNum++;
                                const other = modified[i];
                                const otherContent = (other && other.type !== 'removed') ? other.content : undefined;
                                return renderDiffLine(line, i, isSpacer ? 0 : origLineNum, true, otherContent);
                            })}
                        </div>
                    </div>
                </div>
            </div>
            {/* Modified Pane */}
            <div className="diff-pane modified">
                <div className="diff-pane-header">Modified</div>
                <div className="diff-pane-body">
                    <div
                        ref={modifiedRef}
                        className="diff-pane-content"
                        onScroll={() => handleScroll('modified')}
                    >
                        <div className="diff-content-wrapper">
                            {modified.map((line, i) => {
                                const isSpacer = line.type === 'removed' && line.content === '';
                                if (!isSpacer) modLineNum++;
                                const other = original[i];
                                const otherContent = (other && other.type !== 'added') ? other.content : undefined;
                                return renderDiffLine(line, i, isSpacer ? 0 : modLineNum, false, otherContent);
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
// --- SHARED DIFF LOGIC END ---

interface ChangeLogEntry { Path: string; ChangeType: string; OldContent: string; NewContent: string }
interface HistoryItem { logId: number; timestamp: string; details: string; parsed?: { Summary: string, Changes: ChangeLogEntry[] } }

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


    // Other States
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

    // --- REMOVED: getCompliance Helper (Deleted as per request) ---

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

    // ... (Deploy, Upload, Download, Delete handlers - Kept Unchanged)
    const getFilteredTargets = (): FactoryPC[] => { let targets = [...allPCs]; if (applyTarget === 'version') { if (!applyVersion) return []; targets = targets.filter(p => p.modelVersion === applyVersion) } else if (applyTarget === 'lineandversion') { if (!applyVersion) return []; targets = targets.filter(p => p.modelVersion === applyVersion); if (applyLines.length > 0) targets = targets.filter(p => applyLines.includes(p.lineNumber)); else return [] } return targets }
    const handleVersionChange = (version: string) => { setApplyVersion(version); setApplyLines([]); if (version) { const versionPCs = allPCs.filter(p => p.modelVersion === version); const uniqueLines = Array.from(new Set(versionPCs.map(p => p.lineNumber))).sort((a, b) => a - b); setShownLines(uniqueLines) } else { setShownLines(allLines) } }
    const handleTargetTypeChange = (val: 'all' | 'version' | 'lineandversion') => { setApplyTarget(val); setApplyVersion(''); setApplyLines([]); setShownLines(allLines) }
    const handleDeploy = async (e: React.FormEvent) => { e.preventDefault(); if (!selectedModel) return; setIsDeploying(true); try { const targetedPCs = getFilteredTargets(); if (targetedPCs.length === 0) { if (applyTarget === 'version' && !applyVersion) showToast("Please select a version.", 'error'); else if (applyTarget === 'lineandversion' && applyLines.length === 0) showToast("Please select lines to deploy to.", 'error'); else showToast("No PCs found matching your criteria.", 'error'); setIsDeploying(false); return; } const offline = targetedPCs.filter(p => !p.isOnline); setCurrentDeploymentCandidates([...targetedPCs]); if (offline.length > 0) { setOfflineCandidates([...offline]); setShowOfflineAlert(true); setIsDeploying(false); return; } await proceedWithCheck(targetedPCs) } catch (err: any) { showToast('Error: ' + err.message, 'error'); setIsDeploying(false) } }
    const handleProceedOnlineOnly = async () => { setShowOfflineAlert(false); setIsDeploying(true); const onlinePCs = currentDeploymentCandidates.filter(p => !!p.isOnline); if (onlinePCs.length === 0) { showToast("No online PCs availble in the selection.", 'error'); setIsDeploying(false); return; } await proceedWithCheck(onlinePCs) }
    const proceedWithCheck = async (targetPCs: FactoryPC[]) => { const onlineIds = targetPCs.filter(p => p.isOnline).map(p => p.mcId); try { const req: ApplyModelRequest = { modelFileId: selectedModel!.modelFileId, targetType: 'selected', selectedMCIds: onlineIds, checkOnly: true, applyImmediately: true }; const res = await factoryApi.applyModel(req); if (res.existingCount > 0) { setOverwriteStats({ total: res.totalTargets, existing: res.existingCount }); setPendingRequest({ modelFileId: selectedModel!.modelFileId, targetType: 'selected', selectedMCIds: onlineIds, checkOnly: false, applyImmediately: true } as any); setShowOverwriteConfirm(true); setIsDeploying(false); return; } await executeApply({ modelFileId: selectedModel!.modelFileId, targetType: 'selected', selectedMCIds: onlineIds, checkOnly: false, applyImmediately: true, forceOverwrite: false }, false) } catch (err: any) { showToast("Check failed: " + err.message, 'error'); setIsDeploying(false) } }
    const executeApply = async (req: ApplyModelRequest | null, forceOverwrite: boolean) => { setIsDeploying(true); try { const finalReq = req || pendingRequest!; if (!finalReq) return; finalReq.forceOverwrite = forceOverwrite; finalReq.checkOnly = false; await factoryApi.applyModel(finalReq); showToast('Deployment initiated successfully!', 'success'); setTimeout(() => eventBus.emit(EVENTS.REFRESH_DASHBOARD), 500); handleCloseDeploy() } catch (err: any) { showToast('Deployment failed: ' + err.message, 'error') } finally { setIsDeploying(false) } }
    const handleCloseDeploy = () => { setShowDeploy(false); setShowOverwriteConfirm(false); setSelectedModel(null); setApplyLines([]); setApplyVersion(''); setApplyTarget('all'); setOfflineCandidates([]); setCurrentDeploymentCandidates([]); setPendingRequest(null) }
    const handleDownload = async (model: ModelFile) => { setIsDownloading(true); try { const blob = await factoryApi.downloadModelTemplate(model.modelFileId); const url = window.URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = model.fileName; document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url); showToast("Download started", 'success') } catch (err) { showToast('Download failed', 'error') } finally { setIsDownloading(false) } }
    const handleDelete = async (id: number) => { openConfirm("Confirm Deletion", "Are you sure you want to delete this model? This cannot be undone.", async () => { setIsDeleting(true); try { await factoryApi.deleteModel(id); loadData(); showToast('Model deleted successfully', 'success') } catch (err) { showToast('Delete failed', 'error') } finally { setIsDeleting(false) } }) }
    const handleUpload = async (e: React.FormEvent) => { e.preventDefault(); if (!uploadFile) return; setIsUploading(true); try { await factoryApi.uploadModelToLibrary(uploadFile, uploadName || uploadFile.name.replace('.zip', ''), uploadDesc, uploadCategory); showToast('Model uploaded successfully!', 'success'); setShowUpload(false); setUploadFile(null); setUploadName(''); setUploadDesc(''); loadData() } catch (err) { showToast('Upload failed', 'error') } finally { setIsUploading(false) } }

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
                    <button className="btn btn-primary" onClick={() => setShowUpload(true)} style={{ fontSize: '0.85rem', padding: '0.5rem 0.875rem' }}>
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
                        {models.map(m => {
                            // --- COMPLIANCE STATS REMOVED HERE ---

                            return (
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

                                        {/* Meta Row (Without Compliance) */}
                                        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                                            <div
                                                className="text-mono"
                                                style={{
                                                    fontSize: '0.7rem',
                                                    color: 'var(--text-dim)',
                                                    display: 'flex',
                                                    flexDirection: 'column',
                                                    gap: '4px'
                                                }}
                                            >
                                                <span>
                                                    {m.fileName} • {(m.fileSize / 1024 / 1024).toFixed(2)} MB
                                                </span>

                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <Clock size={10} />
                                                    Last Modified: {new Date(m.uploadedDate).toLocaleString()}
                                                </span>
                                            </div>
                                        </div>

                                    </div>
                                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                                        <button className="btn btn-success" onClick={() => { setSelectedModel(m); setShowDeploy(true); }} style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }} disabled={isDeleting || isDownloading}>
                                            <Rocket size={14} /> Deploy
                                        </button>

                                        <button
                                            className="btn btn-secondary"
                                            onClick={() => handleViewHistory(m)}
                                            style={{ padding: '0.4rem' }}
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
                            )
                        })}
                    </div>
                )}
            </div>

            {/* History Modal - Premium Timeline */}
            {showHistory && selectedModel && (
                <div className="modal-overlay" onClick={() => setShowHistory(false)} style={{ zIndex: 1200 }}>
                    <div className="modal-content history-modal animate-scale-in" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 style={{ fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Clock size={18} color="var(--primary)" />
                                Change History: {selectedModel.modelName}
                            </h3>
                            <button onClick={() => setShowHistory(false)} className="btn btn-secondary btn-icon"><X size={18} /></button>
                        </div>
                        <div className="modal-body" style={{ overflowY: 'auto', padding: '1.5rem', flex: 1, background: 'var(--bg-app)' }}>
                            {loadingHistory ? (
                                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                    <div className="editor-loading-spinner" style={{ width: 24, height: 24 }} />
                                    Loading history...
                                </div>
                            ) : historyLogs.length === 0 ? (
                                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                                    <Clock size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                    <p>No history available for this model.</p>
                                </div>
                            ) : (
                                <div className="history-timeline">
                                    {historyLogs.map((log) => (
                                        <div key={log.logId} className="history-entry">
                                            <div className="history-entry-header">
                                                <div className="history-entry-summary">
                                                    {log.parsed?.Summary || "Update"}
                                                </div>
                                                <div className="history-entry-time">
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </div>
                                            </div>

                                            {log.parsed?.Changes && log.parsed.Changes.length > 0 ? (
                                                <div className="history-entry-files">
                                                    {log.parsed.Changes.map((change, idx) => (
                                                        <div key={idx} className="history-file">
                                                            <div className="history-file-name">
                                                                <FileText size={14} color="var(--primary)" />
                                                                <span>{change.Path}</span>
                                                                <span className={`history-file-badge ${change.ChangeType.toLowerCase()}`}>
                                                                    {change.ChangeType}
                                                                </span>
                                                            </div>
                                                            {change.ChangeType === 'MODIFIED' && (
                                                                <button
                                                                    className="btn btn-secondary"
                                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.7rem', gap: '0.25rem' }}
                                                                    onClick={() => setViewingDiff(change)}
                                                                >
                                                                    <Eye size={12} /> View Diff
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
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* DIFF VIEWER SUB-MODAL - Premium */}
            {viewingDiff && (
                <div className="modal-overlay" onClick={() => setViewingDiff(null)} style={{ zIndex: 1300 }}>
                    <div className="modal-content diff-modal animate-scale-in" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <FileText size={16} color="var(--primary)" />
                                <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>{viewingDiff.Path}</span>
                            </h3>
                            <button onClick={() => setViewingDiff(null)} className="btn btn-secondary btn-icon"><X size={18} /></button>
                        </div>
                        <div className="diff-modal-body">
                            <DiffViewer oldContent={viewingDiff.OldContent} newContent={viewingDiff.NewContent} filePath={viewingDiff.Path} />
                        </div>
                    </div>
                </div>
            )}

            {/* Existing Upload/Deploy Modals (unchanged) */}
            {showUpload && <div className="modal-overlay" onClick={() => setShowUpload(false)}><div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', position: 'relative' }}>{isUploading && <LoadingOverlay message="Uploading model..." />}<div className="modal-header"><h3 style={{ fontSize: '1.05rem', margin: 0 }}>Upload Model</h3><button onClick={() => setShowUpload(false)} className="btn btn-secondary btn-icon"><X size={18} /></button></div><form onSubmit={handleUpload} className="modal-body"><div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>ZIP File *</label><input type="file" accept=".zip" required className="input-field" onChange={e => setUploadFile(e.target.files?.[0] || null)} /></div><div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Category</label><input className="input-field" value={uploadCategory} onChange={e => setUploadCategory(e.target.value)} placeholder="e.g. Production..." /></div><div style={{ marginBottom: '1.5rem' }}><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Description</label><input className="input-field" value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} placeholder="Brief description..." /></div><button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isUploading}>{isUploading ? 'Uploading...' : 'Upload Model'}</button></form></div></div>}
            {showDeploy && selectedModel && <div className="modal-overlay" onClick={handleCloseDeploy}>{!showOverwriteConfirm ? (<div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', position: 'relative' }}>{isDeploying && <LoadingOverlay message="Deploying model..." />}<div className="modal-header"><h3 style={{ fontSize: '1.05rem', margin: 0 }}>Deploy "{selectedModel.modelName}"</h3><button onClick={handleCloseDeploy} className="btn btn-secondary btn-icon"><X size={18} /></button></div><form onSubmit={handleDeploy} className="modal-body"><div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Target Scope</label><select className="input-field" value={applyTarget} onChange={e => handleTargetTypeChange(e.target.value as any)}><option value="all">All PCs</option><option value="version">Target Specific Version</option><option value="lineandversion">Target Lines on Version</option></select></div>{(applyTarget === 'version' || applyTarget === 'lineandversion') && (<div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Model Version</label><select className="input-field" required value={applyVersion} onChange={e => handleVersionChange(e.target.value)}><option value="">Select Version...</option>{versions.map(v => <option key={v} value={v}>{v}</option>)}</select></div>)}{(applyTarget === 'lineandversion') && (<div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Select Lines</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>{shownLines.map(ln => (<div key={ln} onClick={() => setApplyLines(prev => prev.includes(ln) ? prev.filter(x => x !== ln) : [...prev, ln])} style={{ padding: '0.35rem 0.85rem', borderRadius: '999px', background: applyLines.includes(ln) ? 'var(--primary)' : 'var(--bg-hover)', color: applyLines.includes(ln) ? 'white' : 'var(--text-main)', fontSize: '0.85rem', cursor: 'pointer', border: applyLines.includes(ln) ? '1px solid var(--primary)' : '1px solid var(--border)' }}>Line {ln}</div>))}</div></div>)}<button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isDeploying || (applyTarget === 'lineandversion' && applyLines.length === 0)}>{isDeploying ? 'Checking Targets...' : 'Proceed to Deploy'}</button></form></div>) : (<div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}><div className="modal-header"><h3 style={{ fontSize: '1.05rem', margin: 0 }}>Conflict Detected</h3><button onClick={() => setShowOverwriteConfirm(false)} className="btn btn-secondary btn-icon"><X size={18} /></button></div><div className="modal-body"><p style={{ textAlign: 'center' }}>Model exists on {overwriteStats.existing} targets.</p><div style={{ display: 'flex', gap: '0.75rem' }}><button className="btn btn-secondary" onClick={() => pendingRequest && executeApply(pendingRequest, false)}>Skip Existing</button><button className="btn btn-primary" onClick={() => pendingRequest && executeApply(pendingRequest, true)}>Force Overwrite</button></div></div></div>)}</div>}
            {showOfflineAlert && <OfflineAlertModal offlineCandidates={offlineCandidates} onCancel={() => setShowOfflineAlert(false)} onProceedOnlineOnly={handleProceedOnlineOnly} actionLabel="Run on Online Models" />}
            {confirmModal && <ConfirmModal title={confirmModal.title} message={confirmModal.message} onConfirm={() => { confirmModal.onConfirm(); setConfirmModal(null) }} onCancel={() => setConfirmModal(null)} />}
        </div>
    )
}