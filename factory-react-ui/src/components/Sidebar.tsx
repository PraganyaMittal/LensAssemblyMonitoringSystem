import React, { useEffect, useState, useRef, useCallback, cloneElement } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useParams, useSearchParams, useNavigate } from 'react-router-dom'
import {
    Server, Package, LayoutGrid, Box, ChevronRight, ChevronDown,
    Activity, Sun, Moon, ScrollText, PanelLeftClose, PanelLeftOpen
} from 'lucide-react'
import { factoryApi } from '../services/api'
import { useTheme } from '../contexts/ThemeContext'
import { eventBus, EVENTS } from '../utils/eventBus'

// --- Custom Tooltip Component ---
const Tooltip = ({ text, children }: { text?: string, children: React.ReactElement }) => {
    const [visible, setVisible] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    const show = (e: React.MouseEvent) => {
        if (!text) return;
        const rect = e.currentTarget.getBoundingClientRect();
        setPos({
            top: rect.top + (rect.height / 2),
            left: rect.right + 12
        });
        setVisible(true);
    };

    const hide = () => setVisible(false);

    if (!text) return children;

    return (
        <>
            {cloneElement(children, {
                onMouseEnter: (e: React.MouseEvent) => {
                    show(e);
                    if (children.props.onMouseEnter) children.props.onMouseEnter(e);
                },
                onMouseLeave: (e: React.MouseEvent) => {
                    hide();
                    if (children.props.onMouseLeave) children.props.onMouseLeave(e);
                }
            })}
            {visible && createPortal(
                <div className="sidebar-tooltip" style={{ top: pos.top, left: pos.left }}>
                    {text}
                </div>,
                document.body
            )}
        </>
    );
};

// Interface for Line Statistics
interface LineStats {
    lineNumber: number
    online: number
    offline: number
}

// Define default width constant for consistency
// Define default width constant for consistency
const DEFAULT_WIDTH = 260; // Clean 260px default
const COLLAPSED_WIDTH = 64;

export default function Sidebar() {
    const location = useLocation()
    const navigate = useNavigate()
    const { version: activeVersion } = useParams()
    const [searchParams] = useSearchParams()
    const activeLine = searchParams.get('line')
    const { theme, toggleTheme } = useTheme()

    // State
    const [versionMap, setVersionMap] = useState<Record<string, LineStats[]>>({})
    const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>({})
    const [loading, setLoading] = useState(true)

    // Sidebar UI State
    // We keep 'width' state to track the expanded width preference, 
    // but the actual layout is driven by the CSS variable.
    const [width, setWidth] = useState(DEFAULT_WIDTH)
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isResizing, setIsResizing] = useState(false)
    const sidebarRef = useRef<HTMLElement>(null)

    // EFFECT: Sync Width to CSS Variable
    useEffect(() => {
        const root = document.documentElement;
        if (isCollapsed) {
            root.style.setProperty('--sidebar-width', `${COLLAPSED_WIDTH}px`);
        } else {
            root.style.setProperty('--sidebar-width', `${width}px`);
        }
    }, [isCollapsed, width]);

    useEffect(() => {
        loadTree()
        const handleRefresh = () => loadTree()
        eventBus.on(EVENTS.REFRESH_DASHBOARD, handleRefresh)
        const interval = setInterval(loadTree, 5000)
        return () => {
            eventBus.off(EVENTS.REFRESH_DASHBOARD, handleRefresh)
            clearInterval(interval)
        }
    }, [])

    useEffect(() => {
        if (activeVersion && !expandedVersions[activeVersion]) {
            setExpandedVersions(prev => ({ ...prev, [activeVersion]: true }))
        }
    }, [activeVersion])

    const startResizing = useCallback((e: React.MouseEvent) => {
        e.preventDefault()
        setIsResizing(true)
        // Disable transitions globally during resize for performance
        document.body.style.cursor = 'col-resize';
    }, [])

    const stopResizing = useCallback(() => {
        setIsResizing(false)
        document.body.style.cursor = '';
    }, [])

    const resize = useCallback((mouseMoveEvent: MouseEvent) => {
        if (isResizing) {
            // Calculate new width based on mouse position
            // Since sidebar is left-aligned, width is just clientX
            let newWidth = mouseMoveEvent.clientX;

            if (newWidth < 210) {
                if (!isCollapsed) setIsCollapsed(true);
            } else if (newWidth > 600) {
                setWidth(600);
            } else {
                if (isCollapsed) setIsCollapsed(false);
                setWidth(newWidth);
            }
        }
    }, [isResizing, isCollapsed])

    useEffect(() => {
        if (isResizing) {
            window.addEventListener("mousemove", resize)
            window.addEventListener("mouseup", stopResizing)
        }
        return () => {
            window.removeEventListener("mousemove", resize)
            window.removeEventListener("mouseup", stopResizing)
        }
    }, [isResizing, resize, stopResizing])

    const loadTree = async () => {
        try {
            const data = await factoryApi.getPCs()
            const tree: Record<string, Map<number, { online: number, offline: number }>> = {}

            data.lines.forEach(line => {
                line.pcs.forEach(pc => {
                    const v = pc.modelVersion || 'Unknown';
                    if (!tree[v]) tree[v] = new Map();
                    if (!tree[v].has(line.lineNumber)) tree[v].set(line.lineNumber, { online: 0, offline: 0 });

                    const stats = tree[v].get(line.lineNumber)!;
                    if (pc.isOnline) stats.online++;
                    else stats.offline++;
                })
            })

            const finalMap: Record<string, LineStats[]> = {}
            Object.keys(tree).sort().forEach(v => {
                finalMap[v] = Array.from(tree[v].entries())
                    .map(([lineNumber, stats]) => ({
                        lineNumber,
                        online: stats.online,
                        offline: stats.offline
                    }))
                    .sort((a, b) => a.lineNumber - b.lineNumber)
            })
            setVersionMap(finalMap)
        } catch (err) {
            console.error(err)
        } finally {
            setLoading(false)
        }
    }

    const toggleVersion = (v: string, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (isCollapsed) {
            setIsCollapsed(false)
            // UPDATED: Reset to default width when opening from version click
            setWidth(DEFAULT_WIDTH)
            navigate(`/dashboard/${v}`)
        }
        setExpandedVersions(prev => ({ ...prev, [v]: !prev[v] }))
    }

    const isActive = (path: string) => {
        if (path === '/dashboard' && !activeVersion && location.pathname === '/dashboard') return true
        if (path.startsWith('/models') && location.pathname.startsWith('/models')) return true
        return false
    }

    const toggleSidebar = () => {
        if (isCollapsed) {
            // UPDATED: Reset to default width when expanding
            setWidth(DEFAULT_WIDTH)
        }
        setIsCollapsed(!isCollapsed)
    }

    return (
        <aside
            ref={sidebarRef}
            className={`factory-sidebar ${isCollapsed ? 'collapsed' : ''} ${isResizing ? 'resizing' : ''}`}
        // Width is controlled by CSS variable via parent grid
        >
            <div
                className="sidebar-resizer"
                onMouseDown={startResizing}
                title="Drag to resize"
            />

            <div className="sidebar-header" style={{ justifyContent: isCollapsed ? 'center' : 'space-between', padding: isCollapsed ? '0' : '0 1.25rem' }}>
                <div className="sidebar-logo">
                    <div style={{
                        width: 36, height: 36, background: 'var(--primary)', borderRadius: 8,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000',
                        flexShrink: 0
                    }}>
                        <Server size={20} strokeWidth={3} />
                    </div>
                    <div className="sidebar-label" style={{ display: 'flex', flexDirection: 'column', lineHeight: 1 }}>
                        <span>FACTORY</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 400 }}>MONITORING</span>
                    </div>
                </div>

                {!isCollapsed && (
                    <Tooltip text="Collapse">
                        <button
                            onClick={toggleSidebar}
                            className="sidebar-toggle-btn"
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                            <PanelLeftClose size={18} />
                        </button>
                    </Tooltip>
                )}
            </div>

            {isCollapsed && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '0.5rem 0', borderBottom: '1px solid var(--border)' }}>
                    <Tooltip text="Expand">
                        <button
                            onClick={toggleSidebar}
                            style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                        >
                            <PanelLeftOpen size={20} />
                        </button>
                    </Tooltip>
                </div>
            )}

            <nav className="sidebar-nav">
                <div style={{ marginBottom: '2rem' }}>
                    <div className="sidebar-section-title">{isCollapsed ? 'dash' : 'DASHBOARD'}</div>
                    <Tooltip text={isCollapsed ? "Overview" : undefined}>
                        <Link
                            to="/dashboard"
                            className={`sidebar-link ${isActive('/dashboard') ? 'active' : ''}`}
                            style={{ justifyContent: isCollapsed ? 'center' : 'flex-start' }}
                        >
                            <LayoutGrid size={18} />
                            <span className="sidebar-label" style={{ flex: 1 }}>Overview</span>
                        </Link>
                    </Tooltip>
                </div>

                <div style={{ marginBottom: '2rem' }}>
                    <div className="sidebar-section-title">{isCollapsed ? 'prod' : 'PRODUCTION LINES'}</div>
                    {loading ? (
                        <div className="sidebar-label" style={{ padding: '0 1rem', fontSize: '0.8rem', color: 'var(--text-dim)' }}>Loading structure...</div>
                    ) : Object.keys(versionMap).length === 0 ? (
                        <div className="sidebar-label" style={{ padding: '0 1rem', fontSize: '0.8rem', color: 'var(--text-dim)' }}>No versions found</div>
                    ) : (
                        Object.keys(versionMap).map(v => (
                            <div key={v} style={{ marginBottom: '2px' }}>
                                <Tooltip text={isCollapsed ? `Version ${v}` : undefined}>
                                    <div
                                        className={`sidebar-link ${activeVersion === v ? 'text-white' : ''}`}
                                        style={{
                                            justifyContent: isCollapsed ? 'center' : 'space-between',
                                            background: activeVersion === v ? 'var(--bg-hover)' : 'transparent',
                                            cursor: 'pointer'
                                        }}
                                        onClick={(e) => isCollapsed ? toggleVersion(v, e) : null}
                                    >
                                        <Link
                                            to={`/dashboard/${v}`}
                                            style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flex: 1, textDecoration: 'none', color: 'inherit', justifyContent: isCollapsed ? 'center' : 'flex-start' }}
                                        >
                                            <Box size={18} color={activeVersion === v ? 'var(--primary)' : 'currentColor'} />
                                            <span className="sidebar-label">Version {v}</span>
                                        </Link>

                                        <button
                                            onClick={(e) => toggleVersion(v, e)}
                                            className="sidebar-label"
                                            style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex' }}
                                        >
                                            {expandedVersions[v] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                        </button>
                                    </div>
                                </Tooltip>

                                {expandedVersions[v] && !isCollapsed && (
                                    <div style={{
                                        paddingLeft: '1rem',
                                        borderLeft: '1px solid var(--border)',
                                        marginLeft: '1rem',
                                        marginTop: '2px',
                                        marginBottom: '0.5rem'
                                    }}>
                                        {versionMap[v].map(lineData => (
                                            <Link
                                                key={lineData.lineNumber}
                                                to={`/dashboard/${v}?line=${lineData.lineNumber}`}
                                                className="sidebar-link"
                                                style={{
                                                    fontSize: '0.85rem',
                                                    padding: '0.5rem 0.75rem',
                                                    background: (activeVersion === v && activeLine === lineData.lineNumber.toString()) ? 'var(--primary-dim)' : 'transparent',
                                                    color: (activeVersion === v && activeLine === lineData.lineNumber.toString()) ? 'var(--primary)' : 'var(--text-muted)',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    width: '100%',
                                                    textDecoration: 'none'
                                                }}
                                            >
                                                {/* Left Side: Icon + Label */}
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    flex: 1,
                                                    gap: '0.75rem'
                                                }}>
                                                    <Activity size={14} />
                                                    <span style={{ whiteSpace: 'nowrap' }}>Line {lineData.lineNumber}</span>
                                                </div>

                                                {/* Right Side: Status Counts */}
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '0.3rem',
                                                    fontSize: '0.75rem',
                                                    flexShrink: 0
                                                }}>
                                                    <span style={{
                                                        color: '#22c55e',
                                                        fontWeight: 500,
                                                        minWidth: '14px',
                                                        textAlign: 'right'
                                                    }} title="Online PCs">{lineData.online}</span>

                                                    <span style={{ opacity: 0.3 }}>||</span>

                                                    <span style={{
                                                        color: '#ef4444',
                                                        fontWeight: 500,
                                                        minWidth: '14px',
                                                        textAlign: 'left'
                                                    }} title="Offline PCs">{lineData.offline}</span>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                <div>
                    <div className="sidebar-section-title">{isCollapsed ? 'sys' : 'SYSTEM'}</div>
                    <Tooltip text={isCollapsed ? "Model Library" : undefined}>
                        <Link
                            to="/models"
                            className={`sidebar-link ${isActive('/models') ? 'active' : ''}`}
                            style={{ justifyContent: isCollapsed ? 'center' : 'flex-start' }}
                        >
                            <Package size={18} />
                            <span className="sidebar-label">Model Library</span>
                        </Link>
                    </Tooltip>
                    <Tooltip text={isCollapsed ? "Log Analyzer" : undefined}>
                        <div
                            onClick={() => {
                                if (location.pathname === '/log-analyzer') {
                                    // Already on Log Analyzer - emit home event to reset
                                    eventBus.emit(EVENTS.LOG_ANALYZER_HOME);
                                } else {
                                    // Navigate to Log Analyzer
                                    navigate('/log-analyzer');
                                }
                            }}
                            className={`sidebar-link ${location.pathname === '/log-analyzer' ? 'active' : ''}`}
                            style={{
                                justifyContent: isCollapsed ? 'center' : 'flex-start',
                                cursor: 'pointer'
                            }}
                        >
                            <ScrollText size={18} />
                            <span className="sidebar-label">Log Analyzer</span>
                        </div>
                    </Tooltip>
                </div>
            </nav>

            <div style={{ padding: isCollapsed ? '0.5rem 0' : '0.5rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'center' }}>
                <Tooltip text={isCollapsed ? (theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode') : undefined}>
                    <button
                        className="theme-toggle"
                        onClick={toggleTheme}
                        style={{ justifyContent: 'center', padding: isCollapsed ? '0.2rem' : '0.2rem' }}
                    >
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        <span className="sidebar-label">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                    </button>
                </Tooltip>
            </div>
        </aside>
    )
}