import { useState, useEffect, useRef, useMemo } from 'react'
import { useParams, useNavigate, useBlocker } from 'react-router-dom'
import { factoryApi } from '../services/api'
import { ZipEntry } from '../types'
import {
    Folder, FolderOpen, FileText, ArrowLeft, ChevronRight, ChevronDown,
    FileCode, Image as ImageIcon, File as FileIcon, Save, Undo, Redo,
    X, AlertCircle, AlertTriangle, Columns, LayoutTemplate,
    Plus, Minus, PanelLeft
} from 'lucide-react'
import { LoadingOverlay } from '../components/LoadingOverlay'
import { Toast } from '../components/Toast'

// --- Types ---
interface TreeNode {
    name: string
    path: string
    isDirectory: boolean
    children: TreeNode[]
}

interface OpenFile {
    path: string
    name: string
    originalContent: string
    currentContent: string
    isDirty: boolean
    isSupported: boolean
    isLoading: boolean
}

interface DiffLine {
    type: 'same' | 'added' | 'removed'
    content: string
}

// --- Helper: Diff Algorithm (LCS with Alignment) ---
const diffLines = (text1: string, text2: string): { original: DiffLine[], modified: DiffLine[] } => {
    const lines1 = text1.replace(/\r\n/g, "\n").split('\n');
    const lines2 = text2.replace(/\r\n/g, "\n").split('\n');
    const n = lines1.length;
    const m = lines2.length;

    // 1. LCS Matrix
    const dp = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (lines1[i - 1] === lines2[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
            else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }

    // 2. Backtrack
    let i = n, j = m;
    const rawOps: { type: 'same' | 'added' | 'removed', line: string }[] = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && lines1[i - 1] === lines2[j - 1]) {
            rawOps.push({ type: 'same', line: lines1[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            rawOps.push({ type: 'added', line: lines2[j - 1] });
            j--;
        } else {
            rawOps.push({ type: 'removed', line: lines1[i - 1] });
            i--;
        }
    }
    rawOps.reverse();

    // 3. Post-Process (Alignment)
    const originalDiff: DiffLine[] = [];
    const modifiedDiff: DiffLine[] = [];

    let bufferDel: string[] = [];
    let bufferAdd: string[] = [];

    const flushBuffers = () => {
        const commonLen = Math.min(bufferDel.length, bufferAdd.length);

        // Replacements
        for (let k = 0; k < commonLen; k++) {
            originalDiff.push({ type: 'removed', content: bufferDel[k] });
            modifiedDiff.push({ type: 'added', content: bufferAdd[k] });
        }
        // Deletions
        for (let k = commonLen; k < bufferDel.length; k++) {
            originalDiff.push({ type: 'removed', content: bufferDel[k] });
            modifiedDiff.push({ type: 'removed', content: '' }); // Spacer
        }
        // Additions
        for (let k = commonLen; k < bufferAdd.length; k++) {
            originalDiff.push({ type: 'added', content: '' }); // Spacer
            modifiedDiff.push({ type: 'added', content: bufferAdd[k] });
        }
        bufferDel = [];
        bufferAdd = [];
    }

    rawOps.forEach(op => {
        if (op.type === 'same') {
            flushBuffers();
            originalDiff.push({ type: 'same', content: op.line });
            modifiedDiff.push({ type: 'same', content: op.line });
        } else if (op.type === 'removed') {
            bufferDel.push(op.line);
        } else if (op.type === 'added') {
            bufferAdd.push(op.line);
        }
    });
    flushBuffers();

    return { original: originalDiff, modified: modifiedDiff };
}

// --- Tree Builder ---
const buildTree = (entries: ZipEntry[]): TreeNode[] => {
    const root: TreeNode[] = []
    const findNode = (nodes: TreeNode[], name: string) => nodes.find(n => n.name === name)

    entries.forEach(entry => {
        const parts = entry.path.split('/').filter(p => p)
        let currentLevel = root
        parts.forEach((part, index) => {
            const isLast = index === parts.length - 1
            let node = findNode(currentLevel, part)
            if (!node) {
                node = {
                    name: part, path: parts.slice(0, index + 1).join('/'),
                    isDirectory: !isLast || entry.isDirectory, children: []
                }
                currentLevel.push(node)
            }
            if (isLast && entry.isDirectory) node.isDirectory = true
            if (node.isDirectory) currentLevel = node.children
        })
    })
    const sortNodes = (nodes: TreeNode[]) => {
        nodes.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name)
            return a.isDirectory ? -1 : 1
        })
        nodes.forEach(n => { if (n.children.length > 0) sortNodes(n.children) })
    }
    sortNodes(root)
    return root
}

// --- Undo/Redo Hook ---
function useUndoRedo(initialState: string) {
    const [past, setPast] = useState<string[]>([])
    const [present, setPresent] = useState<string>(initialState)
    const [future, setFuture] = useState<string[]>([])
    const canUndo = past.length > 0
    const canRedo = future.length > 0

    const undo = () => {
        if (!canUndo) return
        const previous = past[past.length - 1]
        const newPast = past.slice(0, past.length - 1)
        setFuture([present, ...future]); setPresent(previous); setPast(newPast)
    }
    const redo = () => {
        if (!canRedo) return
        const next = future[0]
        const newFuture = future.slice(1)
        setPast([...past, present]); setPresent(next); setFuture(newFuture)
    }
    const set = (newPresent: string) => {
        if (newPresent === present) return
        setPast([...past, present]); setPresent(newPresent); setFuture([])
    }
    const reset = (newPresent: string) => {
        setPast([]); setPresent(newPresent); setFuture([])
    }
    return { state: present, set, undo, redo, canUndo, canRedo, reset }
}

// --- File Tree Node ---
const FileTreeNode = ({ node, level, onSelect, activeFiles }: {
    node: TreeNode, level: number, onSelect: (path: string) => void, activeFiles: string[]
}) => {
    const [isOpen, setIsOpen] = useState(false)
    const isOpenInTabs = activeFiles.includes(node.path)
    const getIcon = () => {
        if (node.isDirectory) return isOpen ? <FolderOpen size={16} color="var(--warning)" /> : <Folder size={16} color="var(--warning)" />
        const ext = node.name.split('.').pop()?.toLowerCase() || ''
        if (['jpg', 'png', 'jpeg'].includes(ext)) return <ImageIcon size={16} color="var(--success)" />
        if (['json', 'xml', 'js', 'ts', 'ini', 'csv'].includes(ext)) return <FileCode size={16} color="var(--primary)" />
        if (['txt', 'log'].includes(ext)) return <FileText size={16} color="var(--text-muted)" />
        return <FileIcon size={16} color="var(--text-dim)" />
    }
    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation(); if (node.isDirectory) setIsOpen(!isOpen); else onSelect(node.path)
    }
    return (
        <div>
            <div onClick={handleClick} className="hover-bg" style={{
                paddingLeft: `${level * 20 + 10}px`, paddingRight: '10px', paddingTop: '6px', paddingBottom: '6px',
                display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.9rem',
                userSelect: 'none', backgroundColor: isOpenInTabs ? 'var(--bg-hover)' : 'transparent', color: isOpenInTabs ? 'var(--primary)' : 'inherit'
            }}>
                <div style={{ width: '16px', display: 'flex', justifyContent: 'center' }}>
                    {node.isDirectory && (isOpen ? <ChevronDown size={14} style={{ opacity: 0.7 }} /> : <ChevronRight size={14} style={{ opacity: 0.7 }} />)}
                </div>
                {getIcon()}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
            </div>
            {node.isDirectory && isOpen && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {node.children.map(child => <FileTreeNode key={child.path} node={child} level={level + 1} onSelect={onSelect} activeFiles={activeFiles} />)}
                </div>
            )}
        </div>
    )
}

// --- Editor Instance ---
const FileEditor = ({ file, isActive, onUpdate }: {
    file: OpenFile, isActive: boolean, onUpdate: (path: string, content: string, isDirty: boolean) => void
}) => {
    const { state: content, set: setContent, undo, redo, canUndo, canRedo, reset } = useUndoRedo(file.currentContent)
    const [viewMode, setViewMode] = useState<'edit' | 'diff'>('edit')

    const originalRef = useRef<HTMLDivElement>(null)
    const modifiedRef = useRef<HTMLDivElement>(null)
    const editRef = useRef<HTMLTextAreaElement>(null)

    const diffData = useMemo(() => {
        if (viewMode !== 'diff') return { original: [], modified: [] }
        return diffLines(file.originalContent, content)
    }, [file.originalContent, content, viewMode])

    useEffect(() => { if (!file.isDirty && file.currentContent !== content) reset(file.currentContent) }, [file.currentContent, file.isDirty])
    useEffect(() => { if (content !== file.currentContent) onUpdate(file.path, content, content !== file.originalContent) }, [content])

    useEffect(() => {
        if (!isActive) return
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') { e.preventDefault(); undo(); }
            if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isActive, undo, redo])

    const handleScroll = (source: 'original' | 'modified') => {
        if (viewMode !== 'diff') return
        const src = source === 'original' ? originalRef.current : modifiedRef.current
        const dest = source === 'original' ? modifiedRef.current : originalRef.current
        if (src && dest) { dest.scrollTop = src.scrollTop; dest.scrollLeft = src.scrollLeft }
    }

    const renderDiffLine = (line: DiffLine, i: number, isLeftPane: boolean) => {
        let bg = 'transparent'
        let color = 'inherit'
        let IconComponent = null
        let isSpacer = false

        if (isLeftPane) {
            if (line.type === 'removed') { bg = 'rgba(239, 68, 68, 0.15)'; color = 'var(--text-main)'; IconComponent = Minus }
            else if (line.type === 'added') isSpacer = true
        } else {
            if (line.type === 'added') { bg = 'rgba(34, 197, 94, 0.15)'; color = 'var(--text-main)'; IconComponent = Plus }
            else if (line.type === 'removed') {
                if (line.content === '') isSpacer = true
                else bg = 'transparent'
            }
        }

        if (isSpacer) {
            return (
                <div key={i} style={{
                    height: '24px', background: 'var(--bg-app)', opacity: 0.2,
                    backgroundImage: 'linear-gradient(135deg, var(--border) 25%, transparent 25%, transparent 50%, var(--border) 50%, var(--border) 75%, transparent 75%, transparent)',
                    backgroundSize: '4px 4px', borderBottom: '1px solid transparent', display: 'flex'
                }}>
                    <div style={{ width: '36px', borderRight: '1px solid var(--border)', background: 'var(--bg-panel)' }}></div>
                </div>
            )
        }

        return (
            <div key={i} style={{ display: 'flex', backgroundColor: bg, color: color, minHeight: '24px', fontFamily: 'Consolas, monospace', fontSize: '14px', lineHeight: '1.6' }}>
                <div style={{
                    width: '36px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRight: '1px solid var(--border)', userSelect: 'none',
                    color: IconComponent === Plus ? '#16a34a' : (IconComponent === Minus ? '#dc2626' : 'var(--text-muted)'),
                    backgroundColor: 'rgba(0,0,0,0.02)'
                }}>
                    {IconComponent && <IconComponent size={12} strokeWidth={3} />}
                </div>
                <div style={{ padding: '0 8px', whiteSpace: 'pre', overflowX: 'visible' }}>{line.content || ' '}</div>
            </div>
        )
    }

    return (
        <div style={{ display: isActive ? 'flex' : 'none', flexDirection: 'column', height: '100%' }}>
            <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ fontSize: '0.85rem', fontFamily: 'monospace', color: 'var(--text-dim)' }}>{file.path}</div>
                    {file.isSupported && !file.isLoading && (
                        <div style={{ display: 'flex', background: 'var(--bg-panel)', borderRadius: '6px', border: '1px solid var(--border)', padding: '2px' }}>
                            <button onClick={() => setViewMode('edit')} style={{ background: viewMode === 'edit' ? 'var(--bg-hover)' : 'transparent', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: viewMode === 'edit' ? 'var(--primary)' : 'var(--text-muted)' }}><LayoutTemplate size={14} /> Edit</button>
                            <button onClick={() => setViewMode('diff')} style={{ background: viewMode === 'diff' ? 'var(--bg-hover)' : 'transparent', border: 'none', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: viewMode === 'diff' ? 'var(--primary)' : 'var(--text-muted)' }}><Columns size={14} /> Diff</button>
                        </div>
                    )}
                </div>
                {file.isSupported && !file.isLoading && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button className="btn btn-secondary btn-icon" onClick={undo} disabled={!canUndo} title="Undo"><Undo size={16} /></button>
                        <button className="btn btn-secondary btn-icon" onClick={redo} disabled={!canRedo} title="Redo"><Redo size={16} /></button>
                    </div>
                )}
            </div>

            <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex' }}>
                {file.isLoading ? (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-dim)' }}>Loading...</div>
                ) : !file.isSupported ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', gap: '1rem' }}>
                        <AlertCircle size={48} opacity={0.5} /><p style={{ margin: 0, opacity: 0.8 }}>Unsupported File Format</p>
                    </div>
                ) : (
                    <>
                        {viewMode === 'diff' && (
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', background: 'var(--bg-panel)', color: 'var(--text-main)' }}>
                                <div style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'var(--bg-hover)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>ORIGINAL</div>
                                <div ref={originalRef} onScroll={() => handleScroll('original')} style={{ flex: 1, overflow: 'auto', padding: '10px 0' }}>{diffData.original.map((line, i) => renderDiffLine(line, i, true))}</div>
                            </div>
                        )}
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-app)', color: 'var(--text-main)' }}>
                            {viewMode === 'diff' && <div style={{ padding: '4px 10px', fontSize: '0.75rem', background: 'var(--bg-hover)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>MODIFIED</div>}
                            {viewMode === 'edit' ? (
                                <textarea ref={editRef} value={content} onChange={(e) => setContent(e.target.value)} spellCheck={false} style={{ flex: 1, width: '100%', border: 'none', resize: 'none', padding: '20px', fontFamily: 'Consolas, monospace', fontSize: '14px', lineHeight: '1.6', outline: 'none', background: 'var(--bg-app)', color: 'var(--text-main)' }} />
                            ) : (
                                <div ref={modifiedRef} onScroll={() => handleScroll('modified')} style={{ flex: 1, overflow: 'auto', padding: '10px 0' }}>{diffData.modified.map((line, i) => renderDiffLine(line, i, false))}</div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}

// --- Main Page ---
export default function ModelEditor() {
    const { id } = useParams<{ id: string }>()
    const navigate = useNavigate()
    const [structure, setStructure] = useState<TreeNode[]>([])
    const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
    const [activePath, setActivePath] = useState<string | null>(null)
    const [loadingTree, setLoadingTree] = useState(true)
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState<{ msg: string, type: 'success' | 'error' } | null>(null)
    const [tabToClose, setTabToClose] = useState<string | null>(null)
    const [sidebarOpen, setSidebarOpen] = useState(true)

    const isGlobalDirty = openFiles.some(f => f.isDirty)
    const blocker = useBlocker(({ currentLocation, nextLocation }) => isGlobalDirty && currentLocation.pathname !== nextLocation.pathname)

    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (blocker.state === "blocked") blocker.reset(); if (tabToClose) setTabToClose(null); } }
        window.addEventListener('keydown', handleEsc); return () => window.removeEventListener('keydown', handleEsc)
    }, [blocker.state, tabToClose])

    useEffect(() => {
        const onBeforeUnload = (e: BeforeUnloadEvent) => { if (isGlobalDirty) { e.preventDefault(); e.returnValue = '' } }
        window.addEventListener('beforeunload', onBeforeUnload); return () => window.removeEventListener('beforeunload', onBeforeUnload)
    }, [isGlobalDirty])

    useEffect(() => {
        if (!id || !/^\d+$/.test(id)) { navigate('/models', { replace: true }); return; }
        loadStructure(parseInt(id))
    }, [id])

    const loadStructure = async (modelId: number) => {
        try { setStructure(buildTree(await factoryApi.getModelStructure(modelId))) }
        catch (e) { navigate('/models', { replace: true }) }
        finally { setLoadingTree(false) }
    }

    const handleFileSelect = async (path: string) => {
        if (openFiles.some(f => f.path === path)) { setActivePath(path); return }
        const ext = path.split('.').pop()?.toLowerCase() || ''
        const supported = ['txt', 'xml', 'ini', 'csv', 'json'].includes(ext)
        setOpenFiles(prev => [...prev, { path, name: path.split('/').pop() || path, originalContent: '', currentContent: '', isDirty: false, isSupported: supported, isLoading: supported }])
        setActivePath(path)
        if (supported) {
            try {
                const res = await factoryApi.getModelFileContent(parseInt(id!), path)
                setOpenFiles(prev => prev.map(f => f.path === path ? { ...f, originalContent: res.content, currentContent: res.content, isLoading: false } : f))
            } catch (e) {
                setToast({ msg: "Failed to load file", type: 'error' })
                setOpenFiles(prev => prev.map(f => f.path === path ? { ...f, isLoading: false, isSupported: false } : f))
            }
        }
    }

    const requestCloseTab = (e: React.MouseEvent, path: string) => {
        e.stopPropagation()
        const file = openFiles.find(f => f.path === path)
        if (file?.isDirty) { setTabToClose(path) } else { closeTabImmediate(path) }
    }

    const closeTabImmediate = (path: string) => {
        const remaining = openFiles.filter(f => f.path !== path)
        setOpenFiles(remaining)
        if (activePath === path) setActivePath(remaining.length > 0 ? remaining[remaining.length - 1].path : null)
        setTabToClose(null)
    }

    const handleTabSaveAndClose = async () => {
        if (!tabToClose) return
        const file = openFiles.find(f => f.path === tabToClose)
        if (!file) return
        try {
            await factoryApi.saveModelFiles(parseInt(id!), [{ path: file.path, content: file.currentContent }])
            setToast({ msg: "File saved and closed", type: 'success' })
            closeTabImmediate(tabToClose)
        } catch (e) { setToast({ msg: "Save failed", type: 'error' }) }
    }

    const handleUpdateContent = (path: string, content: string, isDirty: boolean) => {
        setOpenFiles(prev => prev.map(f => f.path === path ? { ...f, currentContent: content, isDirty } : f))
    }

    const performSave = async () => {
        const dirtyFiles = openFiles.filter(f => f.isDirty && f.isSupported)
        if (dirtyFiles.length === 0) return true
        setSaving(true)
        try {
            await factoryApi.saveModelFiles(parseInt(id!), dirtyFiles.map(f => ({ path: f.path, content: f.currentContent })))
            setOpenFiles(prev => prev.map(f => {
                if (dirtyFiles.some(df => df.path === f.path)) return { ...f, originalContent: f.currentContent, isDirty: false }
                return f
            }))
            setToast({ msg: `Saved ${dirtyFiles.length} file(s)!`, type: 'success' }); return true
        } catch (e: any) { setToast({ msg: "Save failed", type: 'error' }); return false }
        finally { setSaving(false) }
    }

    useEffect(() => {
        const handleGlobalKey = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); if (isGlobalDirty) performSave() }
        }
        window.addEventListener('keydown', handleGlobalKey); return () => window.removeEventListener('keydown', handleGlobalKey)
    }, [isGlobalDirty, openFiles])

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-app)' }}>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            {saving && <LoadingOverlay message="Saving changes..." />}

            {/* TAB CLOSE CONFIRMATION MODAL */}
            {tabToClose && (
                <div className="modal-overlay" onClick={() => setTabToClose(null)} style={{ zIndex: 2200 }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3 style={{ fontSize: '1rem', margin: 0 }}>Unsaved Changes</h3>
                            <button onClick={() => setTabToClose(null)} className="btn btn-secondary btn-icon"><X size={18} /></button>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '1.5rem' }}>"{tabToClose.split('/').pop()}" has unsaved changes. Do you want to save them before closing?</p>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                <button className="btn btn-secondary" onClick={() => setTabToClose(null)}>Cancel</button>
                                <button className="btn btn-danger" onClick={() => closeTabImmediate(tabToClose)}>Discard</button>
                                <button className="btn btn-primary" onClick={handleTabSaveAndClose}>Save & Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* NAVIGATION BLOCKER MODAL */}
            {blocker.state === "blocked" && (
                <div className="modal-overlay" onClick={() => blocker.reset()} style={{ zIndex: 2200 }}>
                    <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                        <div className="modal-header">
                            <h3 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}><AlertTriangle color="var(--warning)" size={20} /> Unsaved Changes</h3>
                            <button onClick={() => blocker.reset()} className="btn btn-secondary btn-icon"><X size={18} /></button>
                        </div>
                        <div className="modal-body">
                            <p style={{ margin: '0 0 1.5rem 0' }}>You have unsaved changes in your workspace. Save before leaving?</p>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <button className="btn btn-secondary" onClick={() => blocker.reset()}>Cancel</button>
                                <button className="btn btn-danger" onClick={() => blocker.proceed()}>Discard</button>
                                <button className="btn btn-primary" onClick={async () => { if (await performSave()) blocker.proceed() }} disabled={saving}>Save & Leave</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <div style={{ height: '60px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', background: 'var(--bg-panel)', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => navigate('/models')} className="btn btn-secondary btn-icon"><ArrowLeft size={20} /></button>
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className={`btn ${sidebarOpen ? 'btn-secondary' : 'btn-primary'} btn-icon`} title={sidebarOpen ? "Collapse Sidebar" : "Expand Sidebar"}><PanelLeft size={20} /></button>
                    </div>
                    <div><h2 style={{ margin: 0, fontSize: '1.1rem' }}>Model Editor</h2><div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>ID: {id}</div></div>
                </div>
                <button className={`btn ${isGlobalDirty ? 'btn-primary' : 'btn-secondary'}`} onClick={() => performSave()} disabled={!isGlobalDirty || saving} style={{ gap: '8px', minWidth: '120px' }}>
                    <Save size={16} /> {saving ? 'Saving...' : 'Save All'}
                </button>
            </div>

            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
                <div style={{ width: '300px', borderRight: '1px solid var(--border)', overflowY: 'auto', background: 'var(--bg-panel)', display: sidebarOpen ? 'block' : 'none' }}>
                    {loadingTree ? <div style={{ padding: '20px' }}>Loading...</div> : <div style={{ paddingBottom: '20px' }}>{structure.map(node => <FileTreeNode key={node.path} node={node} level={0} onSelect={handleFileSelect} activeFiles={openFiles.map(f => f.path)} />)}</div>}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-app)' }}>
                    {openFiles.length > 0 ? (
                        <div style={{ display: 'flex', overflowX: 'auto', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}>
                            {openFiles.map(file => (
                                <div key={file.path} onClick={() => setActivePath(file.path)} style={{
                                    padding: '10px 15px', fontSize: '0.85rem', cursor: 'pointer', borderRight: '1px solid var(--border)', borderTop: file.path === activePath ? '2px solid var(--primary)' : '2px solid transparent', background: file.path === activePath ? 'var(--bg-app)' : 'transparent', color: file.path === activePath ? 'var(--text-main)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px', maxWidth: '200px'
                                }} className="hover-bg">
                                    <FileIcon size={14} style={{ opacity: 0.7 }} /> <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }} title={file.path}>{file.name}</span>
                                    {file.isDirty && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fbbf24', flexShrink: 0 }} title="Unsaved changes" />}
                                    <div onClick={(e) => requestCloseTab(e, file.path)} style={{ padding: '2px', borderRadius: '4px', cursor: 'pointer' }} className="hover-danger"><X size={14} /></div>
                                </div>
                            ))}
                        </div>
                    ) : <div style={{ height: '40px', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel)' }}></div>}
                    <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                        {openFiles.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}><FileText size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} /><p>Select a file to edit</p></div>
                        ) : openFiles.map(file => <FileEditor key={file.path} file={file} isActive={file.path === activePath} onUpdate={handleUpdateContent} />)}
                    </div>
                </div>
            </div>
        </div>
    )
}