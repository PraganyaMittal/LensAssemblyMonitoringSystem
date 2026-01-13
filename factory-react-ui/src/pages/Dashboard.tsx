import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { LayoutGrid, List, Activity, ChevronRight, Zap, FileCode, AlertCircle, X } from 'lucide-react'
import { factoryApi } from '../services/api'
import { eventBus, EVENTS } from '../utils/eventBus'
import PCCard from '../components/PCCard'
import PCDetailsModal from '../components/PCDetailsModal'
import LineModelManagerModal from '../components/LineModelManagerModal'
import NotFound from './NotFound' // Import NotFound
import type { LineGroup, FactoryPC } from '../types'

type DashboardData = {
    total: number
    online: number
    offline: number
    lines: LineGroup[]
}

export default function Dashboard() {
    const { version } = useParams()
    const [searchParams] = useSearchParams()
    const lineParam = searchParams.get('line')
    const navigate = useNavigate()

    // --- STRICT URL VALIDATION START ---

    // 1. Check for UNKNOWN parameter keys (e.g., ?linjknde=1)
    // We explicitly define that ONLY 'line' is a valid query parameter.
    const allowedParams = ['line'];
    const hasUnknownParams = Array.from(searchParams.keys()).some(key => !allowedParams.includes(key));

    // 2. Check for INVALID line value (e.g., ?line=1hj)
    // Must be digits only.
    const isLineParamInvalid = lineParam !== null && !/^\d+$/.test(lineParam);

    // --- STRICT URL VALIDATION END ---

    const [data, setData] = useState<DashboardData | null>(null)
    const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards')
    const [loading, setLoading] = useState(true)
    const [isNotFound, setIsNotFound] = useState(false) // Not Found State

    const [selectedPC, setSelectedPC] = useState<FactoryPC | null>(null)
    const [managingLine, setManagingLine] = useState<number | null>(null)
    const [expandedLines, setExpandedLines] = useState<Record<number, boolean>>({})
    const [showComplianceModal, setShowComplianceModal] = useState<{ lineNumber: number, nonCompliantPCs: FactoryPC[] } | null>(null)

    const lastDeletedVersionRef = useRef<string | undefined>(undefined)
    const mounted = useRef(true)

    // Reset not found state when URL changes
    useEffect(() => {
        setIsNotFound(false);
    }, [version, lineParam]);

    const loadData = useCallback(async (isInitial: boolean) => {
        if (isInitial) setLoading(true)
        try {
            const targetLine = lineParam ? parseInt(lineParam) : undefined
            const res = await factoryApi.getPCs(version, targetLine)

            // 3. LOGIC: If user asked for specific Version OR Line, but got 0 results -> 404
            const hasSpecificContext = version !== undefined || targetLine !== undefined;

            if (hasSpecificContext && res.lines.length === 0) {
                if (mounted.current) {
                    setIsNotFound(true)
                    setLoading(false)
                }
                return;
            }

            const allPCs = res.lines.flatMap(l => l.pcs)
            const online = allPCs.filter(pc => pc.isOnline).length
            const offline = allPCs.length - online

            const dashboardData: DashboardData = {
                total: allPCs.length,
                online,
                offline,
                lines: res.lines
            }

            if (mounted.current) {
                setData(dashboardData)
                setIsNotFound(false)
            }
        } catch (err) {
            console.error(err)
            // Optional: Handle 404 from API specifically if needed
        } finally {
            if (isInitial && mounted.current) setLoading(false)
        }
    }, [lineParam, version])

    useEffect(() => {
        // STOP: If URL has garbage keys or bad values, don't even fetch.
        if (isLineParamInvalid || hasUnknownParams) return;

        mounted.current = true
        loadData(true)
        const interval = setInterval(() => loadData(false), 5000)
        return () => { mounted.current = false; clearInterval(interval) }
    }, [version, lineParam, isLineParamInvalid, hasUnknownParams, loadData])

    useEffect(() => {
        const handleRefresh = () => loadData(false)
        eventBus.on(EVENTS.REFRESH_DASHBOARD, handleRefresh)
        return () => eventBus.off(EVENTS.REFRESH_DASHBOARD, handleRefresh)
    }, [loadData])

    useEffect(() => {
        if (data && data.lines.length > 0) {
            const initialExpanded: Record<number, boolean> = {}
            let hasNew = false
            data.lines.forEach(line => {
                if (!(line.lineNumber in expandedLines)) {
                    initialExpanded[line.lineNumber] = true
                    hasNew = true
                }
            })
            if (hasNew) {
                setExpandedLines(prev => ({ ...prev, ...initialExpanded }))
            }
        }

        // REDIRECT FALLBACK: If API update shows 0 units on a specific line page (e.g. after delete)
        if (lineParam && data && data.total === 0) {
            const targetVersion = version || lastDeletedVersionRef.current;
            if (targetVersion) {
                navigate(`/dashboard/${targetVersion}`, { replace: true })
            } else {
                navigate('/dashboard', { replace: true })
            }
            lastDeletedVersionRef.current = undefined;
        }
    }, [data, lineParam, version, navigate, expandedLines])

    useEffect(() => {
    if (lineParam) {
        const lineNum = Number(lineParam)
        if (!isNaN(lineNum)) {
            setExpandedLines(prev => ({
                ...prev,
                [lineNum]: true
            }))
        }
    }
    }, [lineParam])

    useEffect(() => {
        if (!lineParam && data) {
            const allExpanded: Record<number, boolean> = {}
            data.lines.forEach(line => {
                allExpanded[line.lineNumber] = true
            })
            setExpandedLines(allExpanded)
        }
    }, [lineParam, data])

    useEffect(() => {
        if (data) {
            const allExpanded: Record<number, boolean> = {}
            data.lines.forEach(line => {
                allExpanded[line.lineNumber] = true
            })
            setExpandedLines(allExpanded)
        }
    }, [viewMode, data])




    const toggleLine = (lineNumber: number) => {
        setExpandedLines(prev => ({ ...prev, [lineNumber]: !prev[lineNumber] }))
    }

    const getLineModelCompliance = (line: LineGroup) => {
        if (!line.pcs || line.pcs.length === 0) {
            return { expectedModel: null, compliantCount: 0, totalCount: 0, nonCompliantPCs: [] }
        }
        const expectedModel = line.targetModelName || null
        if (!expectedModel) {
            return { expectedModel: null, compliantCount: 0, totalCount: 0, nonCompliantPCs: [] }
        }
        const compliantPCs = line.pcs.filter(pc => pc.currentModel?.modelName === expectedModel)
        const nonCompliantPCs = line.pcs.filter(pc => pc.currentModel?.modelName !== expectedModel)
        return {
            expectedModel,
            compliantCount: compliantPCs.length,
            totalCount: line.pcs.length,
            nonCompliantPCs
        }
    }

    const handleComplianceClick = (lineNumber: number, nonCompliantPCs: FactoryPC[]) => {
        if (nonCompliantPCs.length > 0) {
            setShowComplianceModal({ lineNumber, nonCompliantPCs })
        }
    }

    // RENDER NOT FOUND if:
    // 1. Line param format is wrong (isLineParamInvalid)
    // 2. Unknown params exist (hasUnknownParams)
    // 3. API returned empty result for valid query (isNotFound)
    if (isLineParamInvalid || hasUnknownParams || isNotFound) {
        return <NotFound />
    }

    if (loading && !data) return <div className="main-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: '10rem' }}>Loading...</div>

    const getHeaderText = () => {
        if (version && lineParam && data?.lines.find(l => l.lineNumber.toString() === lineParam)) {
            return `Version ${version} • Line ${lineParam} `
        }
        if (version) return `Version ${version} `
        return 'All PCs'
    }

    return (
        <div className="main-content" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div className="dashboard-header">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        <h1 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <Zap size={16} className="pulse" style={{ color: 'var(--primary)', flexShrink: 0 }} />
                            <span>{getHeaderText()}</span>
                        </h1>
                        <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem', alignItems: 'center' }}>
                            <span style={{ color: 'var(--success)', fontWeight: 600 }}>● {data?.online || 0}</span>
                            <span style={{ color: 'var(--danger)', fontWeight: 600 }}>● {data?.offline || 0}</span>
                        </div>
                    </div>
                    <div style={{ background: 'var(--bg-card)', padding: '0.2rem', borderRadius: '5px', border: '1px solid var(--border)', display: 'flex', gap: '0.125rem' }}>
                        <button className="btn" style={{ padding: '0.375rem 0.5rem', background: viewMode === 'cards' ? 'var(--primary)' : 'transparent', color: viewMode === 'cards' ? '#fff' : 'var(--text-muted)', borderRadius: '4px', minWidth: 'auto', border: 'none', display: 'flex', alignItems: 'center' }} onClick={() => setViewMode('cards')}>
                            <LayoutGrid size={15} />
                        </button>
                        <button className="btn" style={{ padding: '0.375rem 0.5rem', background: viewMode === 'list' ? 'var(--primary)' : 'transparent', color: viewMode === 'list' ? '#fff' : 'var(--text-muted)', borderRadius: '4px', minWidth: 'auto', border: 'none', display: 'flex', alignItems: 'center' }} onClick={() => setViewMode('list')}>
                            <List size={15} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="dashboard-scroll-area">
                {data?.lines.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-dim)' }}>
                        <Activity size={40} style={{ opacity: 0.3, marginBottom: '0.875rem' }} />
                        <h3 style={{ fontSize: '1rem', marginBottom: '0.375rem' }}>No units found</h3>
                        <p style={{ fontSize: '0.875rem' }}>There are no active PCs for this selection.</p>
                    </div>
                ) : (
                    data?.lines.map(line => (
                        <div key={line.lineNumber} className="line-section">
                            <div className="line-header" style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.75rem', cursor: 'pointer' }} onClick={() => toggleLine(line.lineNumber)}>
                                <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '0.75rem' }}>
                                    <ChevronRight size={16} className={`line-collapse-icon ${expandedLines[line.lineNumber] ? 'expanded' : ''}`} />
                                    <h2 className="line-header-title">Line {line.lineNumber}</h2>
                                    <div style={{ padding: '0.3rem 0.65rem', background: 'linear-gradient(135deg, var(--bg-hover), var(--bg-panel))', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                                        <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                                        {line.pcs.length} Units
                                    </div>
                                    {version && (
                                        <>
                                            {(() => {
                                                const compliance = getLineModelCompliance(line)
                                                if (compliance.expectedModel) {
                                                    const isFullyCompliant = compliance.compliantCount === compliance.totalCount
                                                    return (
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                            <div style={{ padding: '0.3rem 0.65rem', background: 'linear-gradient(135deg, var(--primary-dim), transparent)', border: '1.5px solid var(--primary)', borderRadius: '10px', fontSize: '0.7rem', fontWeight: 600, color: 'var(--primary)', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', boxShadow: '0 2px 6px var(--primary-dim)', letterSpacing: '-0.01em' }}>
                                                                <FileCode size={11} strokeWidth={2.5} />
                                                                <span className="text-mono">{compliance.expectedModel}</span>
                                                            </div>
                                                            <div onClick={(e) => { if (!isFullyCompliant) { e.stopPropagation(); handleComplianceClick(line.lineNumber, compliance.nonCompliantPCs) } }} style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.6rem', background: isFullyCompliant ? 'var(--success-bg)' : 'var(--danger-bg)', color: isFullyCompliant ? 'var(--success)' : 'var(--danger)', border: `1px solid ${isFullyCompliant ? 'var(--success)' : 'var(--danger)'}`, cursor: isFullyCompliant ? 'default' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.2rem' }} title={isFullyCompliant ? 'All PCs compliant' : 'Click to see non-compliant PCs'}>
                                                                {!isFullyCompliant && <AlertCircle size={10} />}
                                                                {compliance.compliantCount}/{compliance.totalCount}
                                                            </div>
                                                        </div>
                                                    )
                                                }
                                                return null
                                            })()}
                                        </>
                                    )}
                                </div>
                                {version && (
                                    <button className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '0.35rem 0.75rem', height: 'auto' }} onClick={(e) => { e.stopPropagation(); setManagingLine(line.lineNumber) }}>
                                        Manage Models
                                    </button>
                                )}
                            </div>
                            <div className={`line-content ${expandedLines[line.lineNumber] ? '' : 'collapsed'}`}>
                                {viewMode === 'cards' ? (
                                    <div className="pc-grid">
                                        {line.pcs.map(pc => <PCCard key={pc.pcId} pc={pc} onClick={setSelectedPC} showVersion={!version} />)}
                                    </div>
                                ) : (
                                    <div className="table-container">
                                        <table className="data-table">
                                            <thead>
                                                <tr>
                                                    {!version && <th>Version</th>}
                                                    <th>IP Address</th>
                                                    <th>Status</th>
                                                    <th>Application</th>
                                                    <th>Current Model</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {line.pcs.map(pc => (
                                                    <tr key={pc.pcId} onClick={() => setSelectedPC(pc)}>
                                                        {!version && <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>v{pc.modelVersion}</td>}
                                                        <td className="text-mono" style={{ color: 'var(--text-dim)', fontSize: '0.8rem' }}>{pc.ipAddress}</td>
                                                        <td><span className={`badge ${pc.isOnline ? 'badge-success' : 'badge-danger'} `}>{pc.isOnline ? 'Online' : 'Offline'}</span></td>
                                                        <td style={{ fontSize: '0.85rem' }}>{pc.isApplicationRunning ? 'Running' : 'Stopped'}</td>
                                                        <td className="text-mono" style={{ fontSize: '0.8rem' }}>{pc.currentModel?.modelName || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {selectedPC && <PCDetailsModal
                pcSummary={selectedPC}
                onClose={() => setSelectedPC(null)}
                onPCDeleted={(deletedVersion) => {
                    if (lineParam && data) {
                        const currentLine = data.lines.find(l => l.lineNumber.toString() === lineParam);
                        if (currentLine && currentLine.pcs.length <= 1) {
                            const targetVer = version || deletedVersion;
                            if (targetVer) {
                                navigate(`/dashboard/${targetVer}`, { replace: true })
                            } else {
                                navigate('/dashboard', { replace: true })
                            }
                        }
                    }
                    if (deletedVersion) lastDeletedVersionRef.current = deletedVersion;
                    eventBus.emit(EVENTS.REFRESH_DASHBOARD);
                }}
            />}
            {managingLine !== null && (
                <LineModelManagerModal
                    lineNumber={managingLine}
                    version={version}
                    onClose={() => setManagingLine(null)}
                    onOperationComplete={() => { eventBus.emit(EVENTS.REFRESH_DASHBOARD) }}
                />
            )}
            {showComplianceModal && (
                <div className="modal-overlay" onClick={() => setShowComplianceModal(null)}>
                    <div className="modal-content" style={{ maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>Model Compliance - Line {showComplianceModal.lineNumber}</h3>
                            <button onClick={() => setShowComplianceModal(null)} className="btn btn-secondary btn-icon">
                                <X size={20} />
                            </button>
                        </div>
                        <div className="modal-body">
                            <p style={{ marginBottom: '1rem', color: 'var(--text-muted)' }}>
                                The following {showComplianceModal.nonCompliantPCs.length} PC{showComplianceModal.nonCompliantPCs.length !== 1 ? 's have' : ' has'} a different or missing model:
                            </p>
                            <div className="table-container">
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>PC</th>
                                            <th>IP Address</th>
                                            <th>Status</th>
                                            <th>Current Model</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {showComplianceModal.nonCompliantPCs.map(pc => (
                                            <tr key={pc.pcId} onClick={() => { setShowComplianceModal(null); setSelectedPC(pc) }}>
                                                <td style={{ fontWeight: 600 }}>PC-{pc.pcNumber}</td>
                                                <td className="text-mono" style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>{pc.ipAddress}</td>
                                                <td><span className={`badge ${pc.isOnline ? 'badge-success' : 'badge-danger'} `}>{pc.isOnline ? 'Online' : 'Offline'}</span></td>
                                                <td className="text-mono" style={{ fontSize: '0.8rem' }}>{pc.currentModel?.modelName || <span style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>No model</span>}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}