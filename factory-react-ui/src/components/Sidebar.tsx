import React, { useEffect, useState, useRef, useCallback, cloneElement } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useParams, useSearchParams, useNavigate } from 'react-router-dom'
import {
    Server, Package, LayoutGrid, Box, ChevronRight, ChevronDown,
    Activity, Sun, Moon, ScrollText, PanelLeftClose, PanelLeftOpen, RefreshCw
} from 'lucide-react'
import { factoryApi } from '../services/api'
import { useTheme } from '../contexts/ThemeContext'
import { eventBus, EVENTS } from '../utils/eventBus'


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


interface LineStats {
    lineNumber: number
    online: number
    offline: number
}

const DEFAULT_WIDTH = 260;
const COLLAPSED_WIDTH = 64;

export default function Sidebar() {
    const location = useLocation()
    const navigate = useNavigate()
    const { version: activeVersion } = useParams()
    const [searchParams] = useSearchParams()
    const activeLine = searchParams.get('line')
    const { theme, toggleTheme } = useTheme()

    
    const [versionMap, setVersionMap] = useState<Record<string, LineStats[]>>({})
    const [expandedVersions, setExpandedVersions] = useState<Record<string, boolean>>({})
    const [loading, setLoading] = useState(true)

    
    const [width, setWidth] = useState(DEFAULT_WIDTH)
    const [isCollapsed, setIsCollapsed] = useState(false)
    const [isResizing, setIsResizing] = useState(false)
    const sidebarRef = useRef<HTMLElement>(null)

    
    useEffect(() => {
        const root = document.documentElement;
        root.style.setProperty('--sidebar-width', `${isCollapsed ? COLLAPSED_WIDTH : width}px`);
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
        document.body.style.cursor = 'col-resize';
    }, [])

    const stopResizing = useCallback(() => {
        setIsResizing(false)
        document.body.style.cursor = '';
    }, [])

    const resize = useCallback((mouseMoveEvent: MouseEvent) => {
        if (isResizing) {
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
            setWidth(DEFAULT_WIDTH)
        }
        setIsCollapsed(!isCollapsed)
    }

    return (
        <aside
            ref={sidebarRef}
            className={`factory-sidebar ${isCollapsed ? 'collapsed' : ''} ${isResizing ? 'resizing' : ''}`}
        >
            <div
                className="sidebar-resizer"
                onMouseDown={startResizing}
                title="Drag to resize"
            />

            {}
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <div className="sidebar-logo-icon">
                        <Server size={20} strokeWidth={3} />
                    </div>
                    {!isCollapsed && (
                        <div className="sidebar-logo-text">
                            <span>FACTORY</span>
                            <span className="sidebar-logo-sub">MONITORING</span>
                        </div>
                    )}
                </div>
                <button
                    onClick={toggleSidebar}
                    className="sidebar-collapse-btn"
                    title={isCollapsed ? 'Expand' : 'Collapse'}
                >
                    {isCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
                </button>
            </div>

            {}
            <nav className="sidebar-nav">
                {}
                <div className="sidebar-section">
                    {!isCollapsed && <div className="sidebar-section-title">DASHBOARD</div>}
                    <Tooltip text={isCollapsed ? "Overview" : undefined}>
                        <Link
                            to="/dashboard"
                            className={`sidebar-link ${isActive('/dashboard') ? 'active' : ''}`}
                        >
                            <LayoutGrid size={18} />
                            {!isCollapsed && <span>Overview</span>}
                        </Link>
                    </Tooltip>
                </div>

                {}
                <div className="sidebar-section">
                    {!isCollapsed && <div className="sidebar-section-title">PRODUCTION LINES</div>}
                    {loading ? (
                        !isCollapsed && <div className="sidebar-placeholder">Fetching structure...</div>
                    ) : Object.keys(versionMap).length === 0 ? (
                        !isCollapsed && <div className="sidebar-placeholder">No generations found</div>
                    ) : (
                        Object.keys(versionMap).map(v => (
                            <div key={v}>
                                <Tooltip text={isCollapsed ? `Generation ${v}` : undefined}>
                                    <div
                                        className={`sidebar-link ${activeVersion === v ? 'active' : ''}`}
                                        onClick={(e) => isCollapsed ? toggleVersion(v, e) : null}
                                    >
                                        <Link
                                            to={`/dashboard/${v}`}
                                            className="sidebar-link-inner"
                                        >
                                            <Box size={18} color={activeVersion === v ? 'var(--primary)' : 'currentColor'} />
                                            {!isCollapsed && <span>Generation {v}</span>}
                                        </Link>

                                        {!isCollapsed && (
                                            <button
                                                onClick={(e) => toggleVersion(v, e)}
                                                className="sidebar-chevron-btn"
                                            >
                                                {expandedVersions[v] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </button>
                                        )}
                                    </div>
                                </Tooltip>

                                {expandedVersions[v] && !isCollapsed && (
                                    <div className="sidebar-sub-items">
                                        {versionMap[v].map(lineData => (
                                            <Link
                                                key={lineData.lineNumber}
                                                to={`/dashboard/${v}?line=${lineData.lineNumber}`}
                                                className={`sidebar-link sidebar-sub-link ${activeVersion === v && activeLine === lineData.lineNumber.toString() ? 'active' : ''
                                                    }`}
                                            >
                                                <div className="sidebar-link-inner">
                                                    <Activity size={14} />
                                                    <span>Line {lineData.lineNumber}</span>
                                                </div>
                                                <div className="sidebar-line-counts">
                                                    <span className="sidebar-count-online" title="Online PCs">{lineData.online}</span>
                                                    <span className="sidebar-count-sep">||</span>
                                                    <span className="sidebar-count-offline" title="Offline PCs">{lineData.offline}</span>
                                                </div>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {}
                <div className="sidebar-section">
                    {!isCollapsed && <div className="sidebar-section-title">SYSTEM</div>}
                    <Tooltip text={isCollapsed ? "Model Library" : undefined}>
                        <Link
                            to="/models"
                            className={`sidebar-link ${isActive('/models') ? 'active' : ''}`}
                        >
                            <Package size={18} />
                            {!isCollapsed && <span>Model Library</span>}
                        </Link>
                    </Tooltip>
                    <Tooltip text={isCollapsed ? "Log Analyzer" : undefined}>
                        <div
                            onClick={() => {
                                if (location.pathname === '/log-analyzer') {
                                    eventBus.emit(EVENTS.LOG_ANALYZER_HOME);
                                } else {
                                    navigate('/log-analyzer');
                                }
                            }}
                            className={`sidebar-link ${location.pathname === '/log-analyzer' ? 'active' : ''}`}
                        >
                            <ScrollText size={18} />
                            {!isCollapsed && <span>Log Analyzer</span>}
                        </div>
                    </Tooltip>
                    <Tooltip text={isCollapsed ? "Update Manager" : undefined}>
                        <Link
                            to="/updates"
                            className={`sidebar-link ${isActive('/updates') ? 'active' : ''}`}
                        >
                            <RefreshCw size={18} />
                            {!isCollapsed && <span>Update Manager</span>}
                        </Link>
                    </Tooltip>
                </div>
            </nav>

            {}
            <div className="sidebar-footer">
                <Tooltip text={isCollapsed ? (theme === 'dark' ? 'Light Mode' : 'Dark Mode') : undefined}>
                    <button
                        className="theme-toggle"
                        onClick={toggleTheme}
                    >
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        {!isCollapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
                    </button>
                </Tooltip>
            </div>
        </aside>
    )
}