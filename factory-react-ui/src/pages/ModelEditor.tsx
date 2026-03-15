import { useState, useEffect, useMemo, useRef } from 'react'
import { useParams, useNavigate, useBlocker } from 'react-router-dom'
import { factoryApi } from '../services/api'
import { ZipEntry } from '../types'
import {
    Folder, FolderOpen, FileText, ArrowLeft, ChevronRight, ChevronLeft,
    FileCode, Image as ImageIcon, File as FileIcon, Save, Undo, Redo,
    X, AlertCircle, AlertTriangle, Columns, LayoutTemplate,
    Plus, Minus, PanelLeft, Code2, ZoomIn, ZoomOut
} from 'lucide-react'
import { LoadingOverlay } from '../components/LoadingOverlay'
import { Toast } from '../components/Toast'
import XmlVisualEditor, { XmlVisualEditorState } from '../components/XmlVisualEditor'


import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-clike';
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-markup'; 
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-ini';

const highlightCode = (code: string, path: string) => {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    let grammar = languages.clike;
    if (ext === 'js' || ext === 'jsx') grammar = languages.javascript;
    else if (ext === 'ts' || ext === 'tsx') grammar = languages.typescript;
    else if (ext === 'json') grammar = languages.json;
    else if (ext === 'html' || ext === 'xml' || ext === 'svg') grammar = languages.markup;
    else if (ext === 'css') grammar = languages.css;
    else if (ext === 'py') grammar = languages.python;
    else if (ext === 'cs') grammar = languages.csharp;
    else if (ext === 'sh' || ext === 'bash') grammar = languages.bash;
    else if (ext === 'sql') grammar = languages.sql;
    else if (ext === 'yaml' || ext === 'yml') grammar = languages.yaml;
    else if (ext === 'ini' || ext === 'conf' || ext === 'config') grammar = languages.ini;

    return highlight(code || '', grammar, ext);
}


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

interface DiffWord {
    type: 'same' | 'added' | 'removed'
    value: string
}


const diffWords = (text1: string, text2: string): DiffWord[] => {
    if (!text1) text1 = "";
    if (!text2) text2 = "";
    const words1 = text1.split(/([^\w]+)/);
    const words2 = text2.split(/([^\w]+)/);

    const n = words1.length;
    const m = words2.length;

    const dp = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (words1[i - 1] === words2[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
            else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }

    let i = n, j = m;
    const parts: DiffWord[] = [];

    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && words1[i - 1] === words2[j - 1]) {
            parts.unshift({ type: 'same', value: words1[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
            parts.unshift({ type: 'added', value: words2[j - 1] });
            j--;
        } else {
            parts.unshift({ type: 'removed', value: words1[i - 1] });
            i--;
        }
    }
    return parts;
}


const diffLines = (text1: string, text2: string): { original: DiffLine[], modified: DiffLine[] } => {
    const lines1 = text1.replace(/\r\n/g, "\n").split('\n');
    const lines2 = text2.replace(/\r\n/g, "\n").split('\n');
    const n = lines1.length;
    const m = lines2.length;

    const dp = Array(n + 1).fill(0).map(() => Array(m + 1).fill(0));
    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (lines1[i - 1] === lines2[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1;
            else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }

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

    const originalDiff: DiffLine[] = [];
    const modifiedDiff: DiffLine[] = [];
    let bufferDel: string[] = [];
    let bufferAdd: string[] = [];

    const flushBuffers = () => {
        const commonLen = Math.min(bufferDel.length, bufferAdd.length);
        for (let k = 0; k < commonLen; k++) {
            originalDiff.push({ type: 'removed', content: bufferDel[k] });
            modifiedDiff.push({ type: 'added', content: bufferAdd[k] });
        }
        for (let k = commonLen; k < bufferDel.length; k++) {
            originalDiff.push({ type: 'removed', content: bufferDel[k] });
            modifiedDiff.push({ type: 'removed', content: '' });
        }
        for (let k = commonLen; k < bufferAdd.length; k++) {
            originalDiff.push({ type: 'added', content: '' });
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
        } else if (op.type === 'removed') bufferDel.push(op.line);
        else if (op.type === 'added') bufferAdd.push(op.line);
    });
    flushBuffers();

    return { original: originalDiff, modified: modifiedDiff };
}


const buildTree = (entries: ZipEntry[]): TreeNode[] => {
    const root: TreeNode[] = []
    const findNode = (nodes: TreeNode[], name: string) => nodes.find(n => n.name === name)
    entries.forEach(entry => {
        
        const parts = entry.path.replace(/\\/g, '/').split('/').filter(p => p)
        let currentLevel = root
        parts.forEach((part, index) => {
            const isLast = index === parts.length - 1
            let node = findNode(currentLevel, part)
            if (!node) { node = { name: part, path: parts.slice(0, index + 1).join('/'), isDirectory: !isLast || entry.isDirectory, children: [] }; currentLevel.push(node) }
            if (isLast && entry.isDirectory) node.isDirectory = true
            if (node.isDirectory) currentLevel = node.children
        })
    })
    const sortNodes = (nodes: TreeNode[]) => {
        nodes.sort((a, b) => { if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name); return a.isDirectory ? -1 : 1 });
        nodes.forEach(n => { if (n.children.length > 0) sortNodes(n.children) })
    }
    sortNodes(root); return root
}


function useUndoRedo(initialState: string) {
    const [past, setPast] = useState<string[]>([])
    const [present, setPresent] = useState<string>(initialState)
    const [future, setFuture] = useState<string[]>([])
    const canUndo = past.length > 0
    const canRedo = future.length > 0
    const undo = () => { if (!canUndo) return; const previous = past[past.length - 1]; const newPast = past.slice(0, past.length - 1); setFuture([present, ...future]); setPresent(previous); setPast(newPast) }
    const redo = () => { if (!canRedo) return; const next = future[0]; const newFuture = future.slice(1); setPast([...past, present]); setPresent(next); setFuture(newFuture) }
    const set = (newPresent: string) => { if (newPresent === present) return; setPast([...past, present]); setPresent(newPresent); setFuture([]) }
    const reset = (newPresent: string) => { setPast([]); setPresent(newPresent); setFuture([]) }
    return { state: present, set, undo, redo, canUndo, canRedo, reset }
}


const FileTreeNode = ({ node, level, onSelect, activeFiles, animationDelay = 0 }: {
    node: TreeNode,
    level: number,
    onSelect: (path: string) => void,
    activeFiles: string[],
    animationDelay?: number
}) => {
    const [isOpen, setIsOpen] = useState(level === 0)
    const [isAnimating, setIsAnimating] = useState(false)
    const isActive = activeFiles.includes(node.path)
    const isFolder = node.isDirectory

    const getIcon = () => {
        if (isFolder) {
            return isOpen
                ? <FolderOpen size={18} style={{ color: '#fbbf24', filter: 'drop-shadow(0 0 3px rgba(251, 191, 36, 0.3))' }} />
                : <Folder size={18} style={{ color: '#f59e0b' }} />
        }
        const ext = node.name.split('.').pop()?.toLowerCase() || ''
        
        if (['json', 'xml', 'js', 'ts', 'ini', 'csv', 'yaml', 'yml', 'conf', 'config'].includes(ext)) {
            return <FileCode size={16} style={{ color: '#38bdf8' }} />
        }
        
        if (['jpg', 'png', 'jpeg', 'gif', 'svg', 'ico', 'bmp'].includes(ext)) {
            return <ImageIcon size={16} style={{ color: '#22c55e' }} />
        }
        
        if (['txt', 'log', 'md', 'doc', 'docx', 'pdf'].includes(ext)) {
            return <FileText size={16} style={{ color: '#a78bfa' }} />
        }
        
        return <FileIcon size={16} style={{ color: '#64748b' }} />
    }

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation()
        if (isFolder) {
            setIsAnimating(true)
            setIsOpen(!isOpen)
            setTimeout(() => setIsAnimating(false), 300)
        } else {
            onSelect(node.path)
        }
    }

    
    const childCount = isFolder ? node.children.length : 0

    return (
        <div
            className="file-tree-container"
            style={{
                animationDelay: `${animationDelay}ms`,
            }}
        >
            <div
                onClick={handleClick}
                className={`file-tree-node ${isActive ? 'active' : ''} ${isFolder ? 'folder' : ''}`}
                style={{
                    paddingLeft: `${level * 18 + 12}px`,
                    animationDelay: `${animationDelay}ms`,
                }}
            >
                {}
                <div className={`chevron ${isFolder ? (isOpen ? 'open' : '') : ''}`}>
                    {isFolder && (
                        <ChevronRight
                            size={14}
                            style={{
                                strokeWidth: 2.5,
                                transition: 'all 300ms cubic-bezier(0.34, 1.56, 0.64, 1)'
                            }}
                        />
                    )}
                </div>

                {}
                <span className="file-icon">{getIcon()}</span>

                {}
                <span className="file-name">{node.name}</span>

                {}
                {isFolder && childCount > 0 && (
                    <span className="file-count">{childCount}</span>
                )}
            </div>

            {}
            {isFolder && isOpen && (
                <div
                    className="file-tree-children"
                    style={{
                        opacity: isAnimating ? 0 : 1,
                        transform: isAnimating ? 'translateY(-5px)' : 'translateY(0)',
                        transition: 'all 300ms cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                >
                    {node.children.map((child, idx) => (
                        <FileTreeNode
                            key={child.path}
                            node={child}
                            level={level + 1}
                            onSelect={onSelect}
                            activeFiles={activeFiles}
                            animationDelay={idx * 30} 
                        />
                    ))}
                </div>
            )}
        </div>
    )
}


const DiffLineComponent = ({ line, lineNumber, isLeftPane, correspondingContent, filePath, fontSize }: {
    line: DiffLine, lineNumber: number, isLeftPane: boolean, correspondingContent?: string, filePath: string, fontSize?: string
}) => {
    const isSpacer = (isLeftPane && line.type === 'added') || (!isLeftPane && line.type === 'removed' && line.content === '');

    if (isSpacer) {
        return (
            <div className="diff-line spacer">
                <div className="diff-line-number" />
                <div className="diff-line-gutter" />
                <div className="diff-line-content" />
            </div>
        );
    }

    const lineClass = line.type === 'same' ? 'same' : (isLeftPane ? (line.type === 'removed' ? 'removed' : '') : (line.type === 'added' ? 'added' : ''));

    
    
    
    

    let renderParts: { type: 'same' | 'highlight', value: string }[] = [{ type: 'same', value: line.content }];

    if (correspondingContent !== undefined && correspondingContent !== null && correspondingContent !== '') {
        const leftText = isLeftPane ? line.content : correspondingContent;
        const rightText = isLeftPane ? correspondingContent : line.content;
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
        <div className={`diff-line ${lineClass}`} style={{ fontSize: fontSize || 'inherit' }}>
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
}


const FileEditor = ({ file, isActive, onUpdate }: { file: OpenFile, isActive: boolean, onUpdate: (path: string, content: string, isDirty: boolean) => void }) => {
    const { state: content, set: setContent, undo, redo, canUndo, canRedo, reset } = useUndoRedo(file.currentContent)
    const [viewMode, setViewMode] = useState<'edit' | 'diff' | 'visual'>('edit')
    const [zoom, setZoom] = useState(100) 

    
    
    
    const scrollStates = useRef<{
        edit: { scrollTop: number; scrollLeft: number };
        diff: { scrollTop: number; scrollLeft: number };
        visual: XmlVisualEditorState | null;
    }>({
        edit: { scrollTop: 0, scrollLeft: 0 },
        diff: { scrollTop: 0, scrollLeft: 0 },
        visual: null
    });
    const prevViewMode = useRef<'edit' | 'diff' | 'visual'>('edit');

    const isVisualSupported = useMemo(() => {
        
        const isXml = file.path.toLowerCase().endsWith('.xml');
        
        const textToCheck = content || file.currentContent || "";
        const hasDataTag = textToCheck.includes('<data'); 

        console.log(`[ModelEditor] Visual Check - Path: ${file.path}, IsXML: ${isXml}, HasData: ${hasDataTag}`);

        return isXml && hasDataTag;
    }, [file.path, content, file.currentContent]);

    

    const originalRef = useRef<HTMLDivElement>(null)
    const modifiedRef = useRef<HTMLDivElement>(null)
    const centerRef = useRef<HTMLDivElement>(null)
    const textareaRef = useRef<HTMLDivElement>(null)
    const lineNumbersRef = useRef<HTMLDivElement>(null)
    const isScrolling = useRef<'original' | 'modified' | null>(null)
    const timeoutRef = useRef<any>(null)

    
    const { diffData, markers } = useMemo(() => {
        const result = diffLines(file.originalContent, content)
        const myMarkers: { top: number, height: number, color: string }[] = []

        
        const lines = result.modified;
        const totalLines = lines.length

        lines.forEach((line, index) => {
            if (line.type !== 'same') {
                myMarkers.push({
                    top: (index / totalLines) * 100,
                    height: Math.max(0.5, (1 / totalLines) * 100),
                    color: line.type === 'added' ? '#4ade80' : '#f87171'
                })
            }
        })

        return { diffData: result, markers: myMarkers }
    }, [file.originalContent, content])

    
    const handleRevertLine = (diffIndex: number) => {
        const modifiedLines = content.replace(/\r\n/g, "\n").split('\n');

        const currentDiffLine = diffData.modified[diffIndex];
        const originalDiffLine = diffData.original[diffIndex];

        
        if (currentDiffLine.type === 'same') return;

        
        
        let contentLineIndex = 0;
        for (let i = 0; i < diffIndex; i++) {
            const diffLine = diffData.modified[i];
            
            if (diffLine && diffLine.type !== 'removed') {
                contentLineIndex++;
            }
        }

        
        if (currentDiffLine.type === 'added') {
            if (originalDiffLine && originalDiffLine.type === 'removed') {
                
                modifiedLines[contentLineIndex] = originalDiffLine.content;
            } else {
                
                modifiedLines.splice(contentLineIndex, 1);
            }
        } else if (currentDiffLine.type === 'removed') {
            
            
            if (originalDiffLine && originalDiffLine.content !== undefined) {
                modifiedLines.splice(contentLineIndex, 0, originalDiffLine.content);
            }
        }

        setContent(modifiedLines.join('\n'));
    }

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
        const src = source === 'original' ? originalRef.current : modifiedRef.current
        const dest = source === 'original' ? modifiedRef.current : originalRef.current
        if (!src || !dest) return

        if (isScrolling.current !== null && isScrolling.current !== source) return

        isScrolling.current = source
        if (timeoutRef.current) clearTimeout(timeoutRef.current)

        
        dest.scrollTop = src.scrollTop
        dest.scrollLeft = src.scrollLeft

        
        if (centerRef.current) {
            centerRef.current.scrollTop = src.scrollTop
        }

        timeoutRef.current = setTimeout(() => {
            isScrolling.current = null
        }, 50)
    }

    if (!isActive) return null;

    return (
        <div className="editor-content animate-scale-in">
            {}
            <div className="editor-toolbar">
                <div className="editor-toolbar-path">{file.path}</div>
                <div className="editor-toolbar-actions">
                    {file.isSupported && !file.isLoading && (
                        <div className="mode-toggle">
                            <button
                                className={`mode-toggle-btn ${viewMode === 'edit' ? 'active' : ''}`}
                                onClick={() => {
                                    
                                    if (prevViewMode.current === 'edit' && textareaRef.current) {
                                        scrollStates.current.edit = {
                                            scrollTop: textareaRef.current.scrollTop,
                                            scrollLeft: textareaRef.current.scrollLeft
                                        };
                                    } else if (prevViewMode.current === 'diff' && modifiedRef.current) {
                                        scrollStates.current.diff = {
                                            scrollTop: modifiedRef.current.scrollTop,
                                            scrollLeft: modifiedRef.current.scrollLeft
                                        };
                                    }
                                    prevViewMode.current = 'edit';
                                    setViewMode('edit');
                                    
                                    requestAnimationFrame(() => {
                                        if (textareaRef.current) {
                                            textareaRef.current.scrollTop = scrollStates.current.edit.scrollTop;
                                            textareaRef.current.scrollLeft = scrollStates.current.edit.scrollLeft;
                                        }
                                    });
                                }}
                            >
                                <LayoutTemplate size={14} /> Edit
                            </button>
                            <button
                                className={`mode-toggle-btn ${viewMode === 'diff' ? 'active' : ''}`}
                                onClick={() => {
                                    
                                    if (prevViewMode.current === 'edit' && textareaRef.current) {
                                        scrollStates.current.edit = {
                                            scrollTop: textareaRef.current.scrollTop,
                                            scrollLeft: textareaRef.current.scrollLeft
                                        };
                                    } else if (prevViewMode.current === 'diff' && modifiedRef.current) {
                                        scrollStates.current.diff = {
                                            scrollTop: modifiedRef.current.scrollTop,
                                            scrollLeft: modifiedRef.current.scrollLeft
                                        };
                                    }
                                    prevViewMode.current = 'diff';
                                    setViewMode('diff');
                                    
                                    requestAnimationFrame(() => {
                                        if (modifiedRef.current && originalRef.current) {
                                            modifiedRef.current.scrollTop = scrollStates.current.diff.scrollTop;
                                            modifiedRef.current.scrollLeft = scrollStates.current.diff.scrollLeft;
                                            originalRef.current.scrollTop = scrollStates.current.diff.scrollTop;
                                            originalRef.current.scrollLeft = scrollStates.current.diff.scrollLeft;
                                        }
                                    });
                                }}
                            >
                                <Columns size={14} /> Diff
                            </button>
                            {isVisualSupported && (
                                <button
                                    className={`mode-toggle-btn ${viewMode === 'visual' ? 'active' : ''}`}
                                    onClick={() => {
                                        
                                        if (prevViewMode.current === 'edit' && textareaRef.current) {
                                            scrollStates.current.edit = {
                                                scrollTop: textareaRef.current.scrollTop,
                                                scrollLeft: textareaRef.current.scrollLeft
                                            };
                                        } else if (prevViewMode.current === 'diff' && modifiedRef.current) {
                                            scrollStates.current.diff = {
                                                scrollTop: modifiedRef.current.scrollTop,
                                                scrollLeft: modifiedRef.current.scrollLeft
                                            };
                                        }
                                        prevViewMode.current = 'visual';
                                        setViewMode('visual');
                                    }}
                                >
                                    <LayoutTemplate size={14} /> Visual
                                </button>
                            )}
                        </div>
                    )}
                    {file.isSupported && !file.isLoading && viewMode === 'edit' && (
                        <>
                            <button className="btn btn-secondary btn-icon" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Undo size={16} /></button>
                            <button className="btn btn-secondary btn-icon" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)"><Redo size={16} /></button>
                        </>
                    )}
                    {}
                    {file.isSupported && !file.isLoading && (
                        <div className="zoom-controls">
                            <button
                                className="btn btn-secondary btn-icon"
                                onClick={() => setZoom(z => Math.max(50, z - 10))}
                                title="Zoom Out"
                            >
                                <ZoomOut size={16} />
                            </button>
                            <span className="zoom-value">{zoom}%</span>
                            <button
                                className="btn btn-secondary btn-icon"
                                onClick={() => setZoom(z => Math.min(200, z + 10))}
                                title="Zoom In"
                            >
                                <ZoomIn size={16} />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {}
            {file.isLoading ? (
                <div className="editor-loading">
                    <div className="editor-loading-spinner" />
                    <span>Loading file...</span>
                </div>
            ) : !file.isSupported ? (
                <div className="editor-empty">
                    <AlertCircle size={48} className="editor-empty-icon" style={{ color: 'var(--danger)' }} />
                    <p>This file format is not supported for editing</p>
                </div>
            ) : viewMode === 'visual' && isVisualSupported ? (
                <div style={{
                    height: '100%',
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <XmlVisualEditor
                        content={content}
                        originalContent={file.originalContent}
                        onChange={(newContent) => setContent(newContent)}
                        filePath={file.path}
                        initialState={scrollStates.current.visual || undefined}
                        onStateChange={(state) => { scrollStates.current.visual = state; }}
                    />
                </div>
            ) : viewMode === 'diff' ? (
                <div className="diff-container" style={{
                    fontSize: `${14 * zoom / 100}px`, 
                    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
                    transition: 'font-size 200ms cubic-bezier(0.4, 0, 0.2, 1)'
                }}>
                    <style>{`
                        .diff-container .diff-line { line-height: 1.5 !important; }
                    `}</style>
                    {}
                    <div className="diff-pane original">
                        <div className="diff-pane-header">Original</div>
                        <div className="diff-pane-body">
                            <div
                                ref={originalRef}
                                className="diff-pane-content"
                                onScroll={() => handleScroll('original')}
                            >
                                <div className="diff-content-wrapper">
                                    {diffData.original.map((line, i) => {
                                        const other = diffData.modified[i];
                                        const otherContent = (other && other.type !== 'removed') ? other.content : undefined;
                                        return <DiffLineComponent key={i} line={line} lineNumber={i + 1} isLeftPane correspondingContent={otherContent} filePath={file.path} fontSize={`${14 * zoom / 100}px`} />;
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>

                    {}
                    <div className="diff-center-column">
                        <div className="diff-center-header"></div>
                        <div className="diff-center-body" ref={centerRef}>
                            {diffData.modified.map((line, i) => {
                                const origLine = diffData.original[i];
                                
                                
                                
                                
                                const isChanged = line.type !== 'same' ||
                                    (origLine && origLine.type !== 'same');
                                return (
                                    <div key={i} className="diff-center-row">
                                        {isChanged && (
                                            <button
                                                className="diff-center-revert-btn"
                                                onClick={() => handleRevertLine(i)}
                                                title="Revert this change"
                                            >
                                                <ChevronLeft size={12} />
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {}
                    <div className="diff-pane modified">
                        <div className="diff-pane-header">Modified</div>
                        <div className="diff-pane-body">
                            <div
                                ref={modifiedRef}
                                className="diff-pane-content"
                                onScroll={() => handleScroll('modified')}
                            >
                                <div className="diff-content-wrapper">
                                    {diffData.modified.map((line, i) => {
                                        const other = diffData.original[i];
                                        const otherContent = (other && other.type !== 'added') ? other.content : undefined;
                                        return <DiffLineComponent
                                            key={i}
                                            line={line}
                                            lineNumber={i + 1}
                                            isLeftPane={false}
                                            correspondingContent={otherContent}
                                            filePath={file.path}
                                            fontSize={`${14 * zoom / 100}px`}
                                        />;
                                    })}
                                </div>
                            </div>
                            {}
                            <div className="diff-scrollbar-gutter">
                                {markers.map((marker, i) => (
                                    <div
                                        key={i}
                                        className="gutter-marker"
                                        style={{
                                            top: `${marker.top}%`,
                                            height: `${Math.max(marker.height, 2)}%`,
                                            backgroundColor: marker.color
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="editor-edit-wrapper" style={{ fontSize: `${14 * zoom / 100}px`, fontFamily: "'JetBrains Mono', 'Consolas', monospace" }}>
                    {}
                    <div className="editor-scroll-container" ref={textareaRef}>
                        {}
                        <div className="editor-line-numbers" ref={lineNumbersRef}>
                            {content.split('\n').map((_, i) => (
                                <div key={i} className="editor-line-number">{i + 1}</div>
                            ))}
                        </div>
                        {}
                        <div className="editor-code-area">
                            <Editor
                                value={content}
                                onValueChange={code => setContent(code)}
                                highlight={code => highlightCode(code, file.path)}
                                padding={0}
                                style={{
                                    fontFamily: 'inherit',
                                    fontSize: 'inherit',
                                    lineHeight: '1.5em',
                                    backgroundColor: 'transparent',
                                    minWidth: 'max-content',
                                    whiteSpace: 'pre',
                                    overflow: 'visible',
                                }}
                                textareaClassName="editor-textarea-input"
                                preClassName="editor-textarea-pre"
                            />
                        </div>
                    </div>
                    {}
                    <div className="editor-scrollbar-gutter">
                        {markers.map((marker, i) => (
                            <div
                                key={i}
                                className="gutter-marker"
                                style={{
                                    top: `${marker.top}%`,
                                    height: `${Math.max(marker.height, 2)}%`,
                                    backgroundColor: marker.color
                                }}
                            />
                        ))}
                    </div>
                </div>
            )
            }
        </div >
    )
}


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
        const supported = ['txt', 'xml', 'ini', 'csv', 'json', 'md', 'log', 'conf', 'config', 'yaml', 'yml'].includes(ext)
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
        <div className="editor-container">
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
            {saving && <LoadingOverlay message="Saving changes..." />}

            {}
            {tabToClose && (
                <div className="modal-overlay" onClick={() => setTabToClose(null)}>
                    <div className="modal-content animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3 style={{ fontSize: '1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <AlertTriangle size={18} color="var(--warning)" /> Unsaved Changes
                            </h3>
                            <button onClick={() => setTabToClose(null)} className="btn btn-secondary btn-icon"><X size={18} /></button>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
                                "<strong>{tabToClose.split('/').pop()}</strong>" has unsaved changes. Save before closing?
                            </p>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                                <button className="btn btn-secondary" onClick={() => setTabToClose(null)}>Cancel</button>
                                <button className="btn btn-danger" onClick={() => closeTabImmediate(tabToClose)}>Discard</button>
                                <button className="btn btn-primary" onClick={handleTabSaveAndClose}>Save & Close</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {}
            {blocker.state === "blocked" && (
                <div className="modal-overlay" onClick={() => blocker.reset()}>
                    <div className="modal-content animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
                        <div className="modal-header">
                            <h3 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <AlertTriangle size={20} color="var(--warning)" /> Unsaved Changes
                            </h3>
                            <button onClick={() => blocker.reset()} className="btn btn-secondary btn-icon"><X size={18} /></button>
                        </div>
                        <div className="modal-body">
                            <p style={{ margin: '0 0 1.5rem 0' }}>You have unsaved changes. Save before leaving?</p>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
                                <button className="btn btn-secondary" onClick={() => blocker.reset()}>Cancel</button>
                                <button className="btn btn-danger" onClick={() => blocker.proceed()}>Discard</button>
                                <button className="btn btn-primary" onClick={async () => { if (await performSave()) blocker.proceed() }} disabled={saving}>Save & Leave</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {}
            <div className="editor-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button onClick={() => navigate('/models')} className="btn btn-secondary btn-icon" title="Back to Library">
                            <ArrowLeft size={20} />
                        </button>
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className={`btn ${sidebarOpen ? 'btn-secondary' : 'btn-primary'} btn-icon`}
                            title={sidebarOpen ? "Hide Sidebar" : "Show Sidebar"}
                        >
                            <PanelLeft size={20} />
                        </button>
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Code2 size={18} color="var(--primary)" /> Model Editor
                        </h2>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)', fontFamily: 'JetBrains Mono, monospace' }}>ID: {id}</div>
                    </div>
                </div>
                <button
                    className={`btn ${isGlobalDirty ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => performSave()}
                    disabled={!isGlobalDirty || saving}
                    style={{ gap: '8px', minWidth: '130px' }}
                >
                    <Save size={16} /> {saving ? 'Saving...' : 'Save All'}
                </button>
            </div>

            {}
            <div className="editor-body">
                {}
                <div className={`editor-sidebar ${sidebarOpen ? '' : 'collapsed'}`}>
                    <div className="editor-sidebar-header">File Explorer</div>
                    <div className="editor-sidebar-content">
                        {loadingTree ? (
                            <div className="editor-loading">
                                <div className="editor-loading-spinner" />
                            </div>
                        ) : (
                            structure.map(node => (
                                <FileTreeNode key={node.path} node={node} level={0} onSelect={handleFileSelect} activeFiles={openFiles.map(f => f.path)} />
                            ))
                        )}
                    </div>
                </div>

                {}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                    {}
                    {openFiles.length > 0 ? (
                        <div className="editor-tabs">
                            {openFiles.map(file => (
                                <div
                                    key={file.path}
                                    className={`editor-tab ${file.path === activePath ? 'active' : ''}`}
                                    onClick={() => setActivePath(file.path)}
                                    title={file.path}
                                >
                                    <FileIcon size={14} className="tab-icon" />
                                    <span className="tab-name">{file.name}</span>
                                    {file.isDirty && <div className="tab-dirty" title="Unsaved changes" />}
                                    <div className="tab-close" onClick={(e) => requestCloseTab(e, file.path)}>
                                        <X size={14} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="editor-tabs" style={{ height: '40px' }} />
                    )}

                    {}
                    {openFiles.length === 0 ? (
                        <div className="editor-empty">
                            <FileText size={56} className="editor-empty-icon" />
                            <p style={{ fontSize: '0.95rem' }}>Select a file from the sidebar to start editing</p>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>Supported formats: JSON, XML, INI, TXT, CSV, YAML</p>
                        </div>
                    ) : (
                        openFiles.map(file => (
                            <FileEditor key={file.path} file={file} isActive={file.path === activePath} onUpdate={handleUpdateContent} />
                        ))
                    )}
                </div>
            </div>
        </div>
    )
}