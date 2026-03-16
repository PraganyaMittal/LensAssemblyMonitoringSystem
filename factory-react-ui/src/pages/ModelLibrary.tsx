import { useEffect, useState, useRef, useMemo } from 'react'
import { Package, Upload, Trash2, Rocket, Download, X, HardDrive, Edit, Clock, FileText, Plus, Minus, AlertCircle, Search } from 'lucide-react'
import { useSearchParams, useNavigate } from 'react-router-dom';
import NotFound from './NotFound';

import { factoryApi } from '../services/api'
import type { ModelFile, ApplyModelRequest, FactoryPC, ModelVersion } from '../types'
import { LoadingOverlay } from '../components/LoadingOverlay'
import { Toast } from '../components/Toast'
import { ConfirmModal } from '../components/ConfirmModal'
import { OfflineAlertModal } from '../components/OfflineAlertModal'
import { eventBus, EVENTS } from '../utils/eventBus'
import { HubConnectionBuilder } from '@microsoft/signalr'

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

interface DiffLine { type: 'same' | 'added' | 'removed'; content: string }
interface DiffWord { type: 'same' | 'added' | 'removed'; value: string }

export const diffWords = (text1: string, text2: string): DiffWord[] => {
    if (!text1) text1 = ""; if (!text2) text2 = "";
    
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

export const diffLines = (text1: string, text2: string): { original: DiffLine[], modified: DiffLine[] } => {
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

export const DiffViewer = ({ oldContent, newContent, filePath }: { oldContent: string, newContent: string, filePath: string }) => {
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
                {}
                <div className="diff-line-number">{lineNumber}</div>
                {}
                <div className="diff-line-gutter">
                    {line.type === 'removed' && isLeftPane && <Minus size={10} strokeWidth={3} />}
                    {line.type === 'added' && !isLeftPane && <Plus size={10} strokeWidth={3} />}
                </div>
                {}
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

    let origLineNum = 0;
    let modLineNum = 0;

    const { addedBlocks, removedBlocks } = useMemo(() => {
        const total = original.length;
        const added: { start: number, count: number }[] = [];
        const removed: { start: number, count: number }[] = [];

        let curAdd: { start: number, count: number } | null = null;
        let curRem: { start: number, count: number } | null = null;

        for (let i = 0; i < total; i++) {
            
            if (modified[i].type === 'added') {
                if (curAdd && curAdd.start + curAdd.count === i) curAdd.count++;
                else { if (curAdd) added.push(curAdd); curAdd = { start: i, count: 1 }; }
            } else {
                if (curAdd) { added.push(curAdd); curAdd = null; }
            }

            if (original[i].type === 'removed') {
                if (curRem && curRem.start + curRem.count === i) curRem.count++;
                else { if (curRem) removed.push(curRem); curRem = { start: i, count: 1 }; }
            } else {
                if (curRem) { removed.push(curRem); curRem = null; }
            }
        }
        if (curAdd) added.push(curAdd);
        if (curRem) removed.push(curRem);

        return { addedBlocks: added, removedBlocks: removed };
    }, [original, modified]);

    const totalLines = original.length;

    return (
        <div className="diff-container" style={{ height: '100%', minHeight: '500px', position: 'relative' }}>

            {}
            <div className="diff-pane original">
                <div className="diff-pane-header">Original</div>
                <div className="diff-pane-body" style={{ position: 'relative' }}>
                    {}
                    <div className="diff-minimap-left" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '12px', zIndex: 10, pointerEvents: 'none' }}>
                        {removedBlocks.map((b, i) => (
                            <div key={`rem_${i}`} style={{
                                position: 'absolute',
                                top: `${(b.start / totalLines) * 100}%`,
                                height: `${(b.count / totalLines) * 100}%`,
                                right: '2px',
                                width: '5px',
                                backgroundColor: '#ef4444', 
                                opacity: 0.6,
                                minHeight: '2px',
                                borderRadius: '2px'
                            }} />
                        ))}
                    </div>
                    <div
                        ref={originalRef}
                        className="diff-pane-content"
                        style={{ scrollbarGutter: 'stable' }}
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
            {}
            <div className="diff-pane modified">
                <div className="diff-pane-header">Modified</div>
                <div className="diff-pane-body" style={{ position: 'relative' }}>
                    {}
                    <div className="diff-minimap-right" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '12px', zIndex: 10, pointerEvents: 'none' }}>
                        {addedBlocks.map((b, i) => (
                            <div key={`add_${i}`} style={{
                                position: 'absolute',
                                top: `${(b.start / totalLines) * 100}%`,
                                height: `${(b.count / totalLines) * 100}%`,
                                right: '2px',
                                width: '5px',
                                backgroundColor: '#22c55e', 
                                opacity: 0.6,
                                minHeight: '2px',
                                borderRadius: '2px'
                            }} />
                        ))}
                    </div>
                    <div
                        ref={modifiedRef}
                        className="diff-pane-content"
                        style={{ scrollbarGutter: 'stable' }}
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

interface ChangeLogEntry { Path: string; ChangeType: string; OldContent: string; NewContent: string }
interface ChangeLogEntry { Path: string; ChangeType: string; OldContent: string; NewContent: string }

export type ParamChange = { groupName: string; specName: string; valName: string; original: string; current: string };
export function getXmlParamChanges(change: ChangeLogEntry): ParamChange[] {
    if (!change.Path.toLowerCase().endsWith('.xml') || change.ChangeType !== 'MODIFIED') return [];
    const parser = new DOMParser();
    const changes: ParamChange[] = [];
    try {
        const oldDoc = parser.parseFromString(change.OldContent || '', 'text/xml');
        const newDoc = parser.parseFromString(change.NewContent || '', 'text/xml');
        if (oldDoc.querySelector('parsererror') || newDoc.querySelector('parsererror')) return changes;
        
        const oldVals = new Map<string, { value: string; groupName: string; specName: string; valName: string }>();
        oldDoc.querySelectorAll('group').forEach(g => {
            const gId = g.getAttribute('group_ID') || ''; const gName = g.getAttribute('group_name') || gId;
            g.querySelectorAll('spec').forEach(s => {
                const sId = s.getAttribute('spec_ID') || ''; const sName = s.getAttribute('spec_name') || sId;
                s.querySelectorAll('val').forEach(v => {
                    const vId = v.getAttribute('val_id') || ''; const vName = v.getAttribute('val_name') || 'Value';
                    const value = v.getAttribute('value') || '';
                    if (vId) oldVals.set(`${gId}_${sId}_${vId}`, { value, groupName: gName, specName: sName, valName: vName });
                });
            });
        });
        
        newDoc.querySelectorAll('group').forEach(g => {
            const gId = g.getAttribute('group_ID') || ''; const gName = g.getAttribute('group_name') || gId;
            g.querySelectorAll('spec').forEach(s => {
                const sId = s.getAttribute('spec_ID') || ''; const sName = s.getAttribute('spec_name') || sId;
                s.querySelectorAll('val').forEach(v => {
                    const vId = v.getAttribute('val_id') || ''; const vName = v.getAttribute('val_name') || 'Value';
                    if (!vId) return;
                    const newValue = v.getAttribute('value') || '';
                    const key = `${gId}_${sId}_${vId}`;
                    const oldEntry = oldVals.get(key);
                    if (oldEntry && oldEntry.value !== newValue) {
                        changes.push({ groupName: gName, specName: sName, valName: vName, original: oldEntry.value, current: newValue });
                    }
                });
            });
        });
    } catch (e) { console.error('Failed to parse XML for param changes', e); }
    return changes;
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

    const [showUpload, setShowUpload] = useState(false)
    const [showDeploy, setShowDeploy] = useState(false)
    const [showHistory, setShowHistory] = useState(false)
    const [selectedModel, setSelectedModel] = useState<ModelFile | null>(null)

    const [modelHistoryVersions, setModelHistoryVersions] = useState<(ModelVersion & { logData?: { Changes: ChangeLogEntry[] } })[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    const [viewingDiff, setViewingDiff] = useState<ChangeLogEntry | null>(null)
    const [viewingChanges, setViewingChanges] = useState<{ change: ChangeLogEntry; params: ParamChange[] } | null>(null)
    const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set())

    const [searchQuery, setSearchQuery] = useState('')
    const [showNameConflict, setShowNameConflict] = useState(false)
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

    useEffect(() => {
        const connection = new HubConnectionBuilder()
            .withUrl("/agentHub")
            .withAutomaticReconnect()
            .build();

        connection.on("DeploymentStatusUpdate", (mcId: number, _commandId: string, status: string, message: string) => {
            if (status === "Failed") {
                showToast(`Deployment failed for PC ${mcId}: ${message}`, "error");
            } else if (status === "Installed" || status === "Completed") {
                showToast(`Deployment successful for PC ${mcId}`, "success");
            }
        });

        connection.start().catch(console.error);
        return () => { connection.stop(); };
    }, []);

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
            
            const [versions, logs] = await Promise.all([
                factoryApi.getModelVersions(model.modelFileId),
                factoryApi.getModelHistory(model.modelFileId)
            ]);

            const parsedLogs = logs.map((l: any) => {
                const cleanDetails = l.details ? l.details.split('\n[ModelID:')[0] : '';
                let parsed = { Summary: cleanDetails, Changes: [] };
                try {
                    parsed = JSON.parse(cleanDetails);
                } catch {
                    
                }
                return { ...l, parsed };
            });

            const combined = versions.map((v: any) => {
                const vTime = new Date(v.createdDate).getTime();
                
                const match = parsedLogs.find((l: any) => Math.abs(new Date(l.timestamp).getTime() - vTime) < 2000);
                return {
                    ...v,
                    logData: match ? match.parsed : null
                };
            });

            setModelHistoryVersions(combined);
        } catch (e) { showToast("Failed to load history", 'error') }
        finally { setLoadingHistory(false) }
    }

    const handleRevert = async (version: ModelVersion) => {
        if (!selectedModel) return;
        setLoadingHistory(true); 
        try {
            await factoryApi.revertModelVersion(selectedModel.modelFileId, version.modelVersionId);
            showToast(`Reverted to version ${version.versionNumber}`, 'success');
            
            handleViewHistory(selectedModel);
            
            loadData();
        } catch (e) {
            showToast("Failed to revert model", 'error');
            setLoadingHistory(false);
        }
    }

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
    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!uploadFile) return;
        setIsUploading(true);
        try {
            await factoryApi.uploadModelToLibrary(uploadFile, uploadName || uploadFile.name.replace('.zip', ''), uploadDesc, uploadCategory);
            showToast('Model uploaded successfully!', 'success');
            setShowUpload(false);
            setUploadFile(null);
            setUploadName('');
            setUploadDesc('');
            loadData()
        } catch (err: any) {
            const errorMessage = err.message || '';

            if (err.conflictType === 'Name') {
                setShowNameConflict(true);
                return;
            } else if (err.conflictType === 'Content' || errorMessage.includes('Identical model already exists')) {
                const nameStr = err.existingModelName ? ` as "${err.existingModelName}"` : '';
                showToast(`A model with these exact files already exists in the library${nameStr}.`, 'info');
                setShowUpload(false);
                setUploadFile(null);
                setUploadName('');
                setUploadDesc('');
                loadData();
                return;
            } else if (errorMessage.includes('Name conflict detected')) {
                
                setShowNameConflict(true);
                return;
            }

            showToast(errorMessage || 'Upload failed', 'error');
        } finally {
            setIsUploading(false)
        }
    }

    const handleConflictResolution = async (action: 'update' | 'keepBoth') => {
        if (!uploadFile) return;
        setIsUploading(true);
        setShowNameConflict(false);
        try {
            await factoryApi.uploadModelToLibrary(
                uploadFile,
                uploadName || uploadFile.name.replace('.zip', ''),
                uploadDesc,
                uploadCategory,
                action === 'update',
                action === 'keepBoth'
            );
            showToast('Model ' + (action === 'update' ? 'updated' : 'uploaded') + ' successfully!', 'success');
            setShowUpload(false);
            setUploadFile(null);
            setUploadName('');
            setUploadDesc('');
            loadData();
        } catch (err: any) {
            showToast(err.message || 'Action failed', 'error');
        } finally {
            setIsUploading(false);
        }
    }

    return (
        <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {}
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flex: 1, maxWidth: '400px', margin: '0 2rem' }}>
                        <div style={{ position: 'relative', width: '100%' }}>
                            <div style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
                                <Search size={16} />
                            </div>
                            <input
                                type="text"
                                className="input-field"
                                placeholder="Search models by name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ paddingLeft: '2.5rem', width: '100%', borderRadius: '999px', background: 'var(--bg-panel)', border: '1px solid var(--border)' }}
                            />
                        </div>
                    </div>

                    <button className="btn btn-primary" onClick={() => setShowUpload(true)} style={{ fontSize: '0.85rem', padding: '0.5rem 0.875rem' }}>
                        <Upload size={15} /> Upload Model
                    </button>
                </div>
            </div>

            {}
            <div className="dashboard-scroll-area" style={{ position: 'relative' }}>
                {loading && <LoadingOverlay message="Loading library..." />}
                {isDeleting && <LoadingOverlay message="Deleting model..." />}
                {isDownloading && <LoadingOverlay message="Downloading model..." />}

                {!loading && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {models.filter(m => m.modelName.toLowerCase().includes(searchQuery.toLowerCase())).map(m => {

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

                                        {}
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

            {}
            {showHistory && selectedModel && (
                <div className="modal-overlay" onClick={() => setShowHistory(false)} style={{ zIndex: 1200 }}>
                    <div className="modal-content history-modal animate-scale-in" onClick={e => e.stopPropagation()} style={{ width: '800px', maxWidth: '90vw' }}>
                        <div className="modal-header">
                            <h3 style={{ fontSize: '1.05rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Clock size={18} color="var(--primary)" />
                                Generation History: {selectedModel.modelName}
                            </h3>
                            <button onClick={() => setShowHistory(false)} className="btn btn-secondary btn-icon"><X size={18} /></button>
                        </div>
                        <div className="modal-body" style={{ overflowY: 'auto', padding: '1.5rem', flex: 1, background: 'var(--bg-app)', maxHeight: '60vh' }}>
                            {loadingHistory ? (
                                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
                                    <div className="editor-loading-spinner" style={{ width: 24, height: 24 }} />
                                    Loading history...
                                </div>
                            ) : modelHistoryVersions.length === 0 ? (
                                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                                    <Clock size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                    <p>No generation history available.</p>
                                </div>
                            ) : (
                                <div className="history-timeline">
                                    {modelHistoryVersions.map((ver, idx) => {
                                        const isLatest = idx === 0;
                                        return (
                                            <div key={ver.modelVersionId} className="history-entry" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '1rem', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', position: 'relative' }}>
                                                {}
                                                {idx !== modelHistoryVersions.length - 1 && (
                                                    <div style={{ position: 'absolute', left: '2rem', top: '3.5rem', bottom: '-1.5rem', width: '2px', background: 'var(--border)', zIndex: 0 }} />
                                                )}

                                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', zIndex: 1 }}>
                                                    <div style={{ display: 'flex', gap: '1rem' }}>
                                                        <div style={{ width: '2rem', height: '2rem', borderRadius: '50%', background: isLatest ? 'var(--primary)' : 'var(--bg-hover)', color: isLatest ? 'white' : 'var(--text-dim)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8rem', border: '2px solid var(--bg-app)' }}>
                                                            {ver.versionNumber}
                                                        </div>
                                                        <div>
                                                            <div style={{ fontWeight: 600, fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '0.25rem' }}>
                                                                {ver.changeSummary || 'No summary provided'}
                                                            </div>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <Clock size={12} /> {new Date(ver.createdDate).toLocaleString()}
                                                                </span>
                                                                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                    <FileText size={12} /> {(ver.size / 1024).toFixed(1)} KB
                                                                </span>
                                                                <span>
                                                                    By: <span style={{ color: 'var(--text-main)' }}>{ver.createdBy || 'Unknown'}</span>
                                                                </span>
                                                            </div>

                                                            {}
                                                            {ver.logData && ver.logData.Changes && ver.logData.Changes.length > 0 && (
                                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginTop: '0.75rem' }}>
                                                                    {ver.logData.Changes.map((change, cIdx) => {
                                                                        const paramChanges = getXmlParamChanges(change);
                                                                        const hasParamChanges = paramChanges.length > 0;
                                                                        return (
                                                                            <div key={cIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem' }}>
                                                                                <FileText size={12} color="var(--text-dim)" />
                                                                                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-muted)' }}>{change.Path}</span>
                                                                                <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
                                                                                    <button
                                                                                        className="btn btn-secondary btn-sm"
                                                                                        style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', height: 'auto' }}
                                                                                        onClick={() => setViewingDiff(change)}
                                                                                    >
                                                                                        View Diff
                                                                                    </button>
                                                                                    {hasParamChanges && (
                                                                                        <button
                                                                                            className="btn btn-warning btn-sm"
                                                                                            style={{ fontSize: '0.7rem', padding: '0.15rem 0.5rem', height: 'auto', background: 'rgba(251, 191, 36, 0.1)', color: 'var(--warning)', border: '1px solid rgba(251, 191, 36, 0.2)' }}
                                                                                            onClick={() => setViewingChanges({ change, params: paramChanges })}
                                                                                        >
                                                                                            {paramChanges.length} Changes
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {!isLatest && (
                                                        <button
                                                            className="btn btn-secondary"
                                                            onClick={() => openConfirm(
                                                                "Revert Model",
                                                                `Are you sure you want to revert to Generation ${ver.versionNumber}? This will create a new generation with the contents of ${ver.versionNumber}.`,
                                                                () => handleRevert(ver)
                                                            )}
                                                            style={{ fontSize: '0.8rem', padding: '0.35rem 0.75rem', marginLeft: 'auto' }}
                                                        >
                                                            <Clock size={14} style={{ marginRight: '4px' }} /> Revert
                                                        </button>
                                                    )}
                                                    {isLatest && (
                                                        <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Current</span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {}
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

            {}
            {viewingChanges && (
                <div className="modal-overlay" onClick={() => setViewingChanges(null)} style={{ zIndex: 1300 }}>
                    <div className="modal-content animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '720px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header" style={{ borderBottom: '1px solid rgba(251, 191, 36, 0.2)', background: 'rgba(251, 191, 36, 0.06)' }}>
                            <h3 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--warning)' }}>
                                <Clock size={16} />
                                Parameter Changes
                                <span style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem', borderRadius: '999px', background: 'rgba(251, 191, 36, 0.15)', color: 'var(--warning)', fontWeight: 600 }}>
                                    {viewingChanges.params.length}
                                </span>
                            </h3>
                            <button onClick={() => setViewingChanges(null)} className="btn btn-secondary btn-icon"><X size={18} /></button>
                        </div>
                        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <FileText size={13} color="var(--text-dim)" />
                            <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{viewingChanges.change.Path}</span>
                        </div>
                        <div style={{ flex: 1, overflow: 'auto', padding: '0' }}>
                            <table style={{ minWidth: '680px', borderCollapse: 'collapse', fontSize: '0.85rem', tableLayout: 'fixed', width: '100%' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(255,255,255,0.04)', position: 'sticky', top: 0, zIndex: 1 }}>
                                        <th style={{ textAlign: 'left', padding: '0.6rem 1rem', color: 'var(--text-muted)', fontWeight: 500, borderBottom: '1px solid var(--border)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: '45%' }}>Parameter</th>
                                        <th style={{ textAlign: 'left', padding: '0.6rem 1rem', color: 'var(--text-muted)', fontWeight: 500, borderBottom: '1px solid var(--border)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: '27.5%' }}>Original</th>
                                        <th style={{ textAlign: 'left', padding: '0.6rem 1rem', color: 'var(--text-muted)', fontWeight: 500, borderBottom: '1px solid var(--border)', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', width: '27.5%' }}>Current</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {viewingChanges.params.map((p, idx) => {
                                        const origExpanded = expandedCells.has(`orig_${idx}`);
                                        const curExpanded = expandedCells.has(`cur_${idx}`);
                                        const toggleCell = (key: string) => setExpandedCells(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
                                        return (
                                            <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                <td style={{ padding: '0.6rem 1rem' }}>
                                                    <div style={{ color: 'var(--text-main)', fontWeight: 500, fontSize: '0.85rem' }}>{p.valName}</div>
                                                    <div style={{ color: 'var(--text-dim)', fontSize: '0.72rem', marginTop: '0.15rem' }}>{p.groupName} › {p.specName}</div>
                                                </td>
                                                <td style={{ padding: '0.6rem 1rem' }}>
                                                    <span
                                                        onClick={() => toggleCell(`orig_${idx}`)}
                                                        style={{ color: '#ef4444', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', cursor: 'pointer', display: 'block', ...(origExpanded ? { wordBreak: 'break-all' as const, whiteSpace: 'normal' as const } : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }) }}
                                                        title={origExpanded ? 'Click to collapse' : p.original}
                                                    >{p.original}</span>
                                                </td>
                                                <td style={{ padding: '0.6rem 1rem' }}>
                                                    <span
                                                        onClick={() => toggleCell(`cur_${idx}`)}
                                                        style={{ color: '#22c55e', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', cursor: 'pointer', display: 'block', ...(curExpanded ? { wordBreak: 'break-all' as const, whiteSpace: 'normal' as const } : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }) }}
                                                        title={curExpanded ? 'Click to collapse' : p.current}
                                                    >{p.current}</span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {}
            {showUpload && <div className="modal-overlay" onClick={() => setShowUpload(false)}><div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', position: 'relative' }}>{isUploading && <LoadingOverlay message="Uploading model..." />}<div className="modal-header"><h3 style={{ fontSize: '1.05rem', margin: 0 }}>Upload Model</h3><button onClick={() => setShowUpload(false)} className="btn btn-secondary btn-icon"><X size={18} /></button></div><form onSubmit={handleUpload} className="modal-body"><div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>ZIP File *</label><input type="file" accept=".zip" required className="input-field" onChange={e => setUploadFile(e.target.files?.[0] || null)} /></div><div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Model Name</label><input className="input-field" value={uploadName} onChange={e => setUploadName(e.target.value)} placeholder={uploadFile ? uploadFile.name.replace('.zip', '') : 'Auto-detected from file name'} /></div><div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Category</label><input className="input-field" value={uploadCategory} onChange={e => setUploadCategory(e.target.value)} placeholder="e.g. Production..." /></div><div style={{ marginBottom: '1.5rem' }}><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Description</label><input className="input-field" value={uploadDesc} onChange={e => setUploadDesc(e.target.value)} placeholder="Brief description..." /></div><button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isUploading}>{isUploading ? 'Uploading...' : 'Upload Model'}</button></form></div></div>}

            {showNameConflict && (
                <div className="modal-overlay" onClick={() => setShowNameConflict(false)} style={{ zIndex: 1400 }}>
                    <div className="modal-content animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: '1.5rem' }}>
                            <div style={{ width: '3rem', height: '3rem', borderRadius: '50%', background: 'rgba(251, 191, 36, 0.1)', color: 'var(--warning)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                                <AlertCircle size={24} />
                            </div>
                            <h3 style={{ fontSize: '1.1rem', margin: '0 0 0.5rem 0', color: 'var(--text-main)' }}>Name Conflict</h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-dim)', margin: 0, lineHeight: 1.5 }}>
                                A model named <strong style={{ color: 'var(--text-main)' }}>"{uploadName || uploadFile?.name.replace('.zip', '')}"</strong> already exists. What would you like to do?
                            </p>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            <button
                                className="btn btn-primary"
                                onClick={() => handleConflictResolution('update')}
                                style={{ justifyContent: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.75rem', gap: '0.25rem' }}
                            >
                                <span style={{ fontWeight: 600 }}>Replace / Update Existing</span>
                                <span style={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 400 }}>Add this upload as a new generation</span>
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => handleConflictResolution('keepBoth')}
                                style={{ justifyContent: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.75rem', gap: '0.25rem' }}
                            >
                                <span style={{ fontWeight: 600 }}>Keep Both (Auto-Rename)</span>
                                <span style={{ fontSize: '0.7rem', opacity: 0.8, fontWeight: 400 }}>Save as a completely new model</span>
                            </button>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setShowNameConflict(false)}
                                style={{ justifyContent: 'center', background: 'transparent', border: '1px solid transparent', marginTop: '0.25rem' }}
                            >
                                Cancel Upload
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {showDeploy && selectedModel && <div className="modal-overlay" onClick={handleCloseDeploy}>{!showOverwriteConfirm ? (<div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', position: 'relative' }}>{isDeploying && <LoadingOverlay message="Deploying model..." />}<div className="modal-header"><h3 style={{ fontSize: '1.05rem', margin: 0 }}>Deploy "{selectedModel.modelName}"</h3><button onClick={handleCloseDeploy} className="btn btn-secondary btn-icon"><X size={18} /></button></div><form onSubmit={handleDeploy} className="modal-body"><div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Target Scope</label><select className="input-field" value={applyTarget} onChange={e => handleTargetTypeChange(e.target.value as any)}><option value="all">All PCs</option><option value="version">Target Specific Generation</option><option value="lineandversion">Target Lines on Generation</option></select></div>{(applyTarget === 'version' || applyTarget === 'lineandversion') && (<div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Model Generation</label><select className="input-field" required value={applyVersion} onChange={e => handleVersionChange(e.target.value)}><option value="">Select Generation...</option>{versions.map(v => <option key={v} value={v}>{v}</option>)}</select></div>)}{(applyTarget === 'lineandversion') && (<div style={{ marginBottom: '1rem' }}><label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)' }}>Select Lines</label><div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '150px', overflowY: 'auto' }}>{shownLines.map(ln => (<div key={ln} onClick={() => setApplyLines(prev => prev.includes(ln) ? prev.filter(x => x !== ln) : [...prev, ln])} style={{ padding: '0.35rem 0.85rem', borderRadius: '999px', background: applyLines.includes(ln) ? 'var(--primary)' : 'var(--bg-hover)', color: applyLines.includes(ln) ? 'white' : 'var(--text-main)', fontSize: '0.85rem', cursor: 'pointer', border: applyLines.includes(ln) ? '1px solid var(--primary)' : '1px solid var(--border)' }}>Line {ln}</div>))}</div></div>)}<button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={isDeploying || (applyTarget === 'lineandversion' && applyLines.length === 0)}>{isDeploying ? 'Checking Targets...' : 'Proceed to Deploy'}</button></form></div>) : (<div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}><div className="modal-header"><h3 style={{ fontSize: '1.05rem', margin: 0 }}>Conflict Detected</h3><button onClick={() => setShowOverwriteConfirm(false)} className="btn btn-secondary btn-icon"><X size={18} /></button></div><div className="modal-body"><p style={{ textAlign: 'center' }}>Model exists on {overwriteStats.existing} targets.</p><div style={{ display: 'flex', gap: '0.75rem' }}><button className="btn btn-secondary" onClick={() => pendingRequest && executeApply(pendingRequest, false)}>Skip Existing</button><button className="btn btn-primary" onClick={() => pendingRequest && executeApply(pendingRequest, true)}>Force Overwrite</button></div></div></div>)}</div>}
            {showOfflineAlert && <OfflineAlertModal offlineCandidates={offlineCandidates} onCancel={() => setShowOfflineAlert(false)} onProceedOnlineOnly={handleProceedOnlineOnly} actionLabel="Run on Online Models" />}
            {confirmModal && <ConfirmModal title={confirmModal.title} message={confirmModal.message} onConfirm={() => { confirmModal.onConfirm(); setConfirmModal(null) }} onCancel={() => setConfirmModal(null)} />}
        </div>
    )
}