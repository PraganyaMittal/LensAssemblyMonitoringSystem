import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { LayoutGrid, List, Activity, ChevronRight, Zap, FileCode, AlertCircle, AlertTriangle, CheckCircle, X, RefreshCw } from 'lucide-react'
import { HubConnectionBuilder, LogLevel } from '@microsoft/signalr'
import { factoryApi } from '../services/api'
import { updateApi } from '../services/updateApi'
import { eventBus, EVENTS } from '../utils/eventBus'
import MCCard from '../components/MCCard'
import MCDetailsModal from '../components/MCDetailsModal'
import LineModelManagerModal from '../components/LineModelManagerModal'
import LineSoftwareUpdateModal from '../features/Updates/LineSoftwareUpdatePanel'
import NotFound from './NotFound' 
import type { LineGroup, FactoryPC } from '../types'

type DashboardData = {
    total: number
    online: number
    offline: number
    lines: LineGroup[]
}


type ViewMode = 'cards' | 'list';
type ViewState = Record<number, boolean>; 
type ContextState = Record<ViewMode, ViewState>; 
type GlobalState = Record<string, ContextState>; 

export default function Dashboard() {
    const { version } = useParams()
    const [searchParams] = useSearchParams()
    const lineParam = searchParams.get('line')
    const navigate = useNavigate()

    
    const allowedParams = ['line'];
    const hasUnknownParams = Array.from(searchParams.keys()).some(key => !allowedParams.includes(key));
    const isLineParamInvalid = lineParam !== null && !/^\d+$/.test(lineParam);
    

    const [data, setData] = useState<DashboardData | null>(null)
    const [viewMode, setViewMode] = useState<ViewMode>('cards')
    const [loading, setLoading] = useState(true)
    const [isNotFound, setIsNotFound] = useState(false)

    const [selectedTab, setSelectedTab] = useState<string>('')

    const [selectedPC, setSelectedPC] = useState<FactoryPC | null>(null)
    const [managingLine, setManagingLine] = useState<number | null>(null)
    const [updatingLine, setUpdatingLine] = useState<number | null>(null)

    
    const [expandedLines, setExpandedLines] = useState<GlobalState>({})

    const [showComplianceModal, setShowComplianceModal] = useState<{ lineNumber: number, nonCompliantPCs: FactoryPC[] } | null>(null)

    // Per-line deployment stats
    type LineDeployStats = { active: number; completed: number; failed: number };
    const [lineDeployStats, setLineDeployStats] = useState<Record<number, LineDeployStats>>({});

    const lastDeletedVersionRef = useRef<string | undefined>(undefined)
    const mounted = useRef(true)

    
    
    const getContextKey = useCallback((): string => {
        const parts = [];
        if (version) parts.push(`v:${version}`);
        if (lineParam) parts.push(`l:${lineParam}`);
        return parts.length > 0 ? parts.join('|') : 'overview';
    }, [version, lineParam]);

    const contextKey = getContextKey();

    
    useEffect(() => {
        setIsNotFound(false);
    }, [version, lineParam]);

    const loadData = useCallback(async (isInitial: boolean) => {
        if (isInitial) setLoading(true)
        try {
            const targetLine = lineParam ? parseInt(lineParam) : undefined
            const res = await factoryApi.getPCs(version, targetLine)

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
        } finally {
            if (isInitial && mounted.current) setLoading(false)
        }
    }, [lineParam, version])

    useEffect(() => {
        if (isLineParamInvalid || hasUnknownParams) return;

        mounted.current = true
        loadData(true)
        
        
        const connection = new HubConnectionBuilder()
            .withUrl('/agentHub')
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Warning)
            .build();

        connection.on("McStatusChanged", (update: { mcId: number, isOnline: boolean, isApplicationRunning: boolean, lastHeartbeat: string }) => {
            if (mounted.current) {
                setData(prevData => {
                    if (!prevData) return prevData;
                    
                    
                    const newLines = prevData.lines.map(line => ({
                        ...line,
                        pcs: line.pcs.map(pc => {
                            if (pc.mcId === update.mcId) {
                                return {
                                    ...pc,
                                    isOnline: update.isOnline,
                                    isApplicationRunning: update.isApplicationRunning,
                                    lastHeartbeat: update.lastHeartbeat
                                };
                            }
                            return pc;
                        })
                    }));
                    
                    const allPCs = newLines.flatMap(l => l.pcs);
                    const online = allPCs.filter(pc => pc.isOnline).length;
                    const offline = allPCs.length - online;
                    
                    return {
                        ...prevData,
                        online,
                        offline,
                        lines: newLines
                    };
                });
            }
        });

        connection.start().catch(err => console.error('Dashboard SignalR Connection Error:', err));

        return () => { 
            mounted.current = false; 
            connection.stop(); 
        }
    }, [version, lineParam, isLineParamInvalid, hasUnknownParams, loadData])

    useEffect(() => {
        const handleRefresh = () => loadData(false)
        eventBus.on(EVENTS.REFRESH_DASHBOARD, handleRefresh)
        return () => eventBus.off(EVENTS.REFRESH_DASHBOARD, handleRefresh)
    }, [loadData])

    // Fetch deployment stats per line
    useEffect(() => {
        const fetchDeployStats = async () => {
            try {
                const res = await updateApi.getSchedules(undefined, 1, 100);
                const statsMap: Record<number, LineDeployStats> = {};

                for (const s of res.schedules) {
                    if (s.targetType === 'ByLine' && s.targetFilter) {
                        try {
                            const filter = JSON.parse(s.targetFilter);
                            const lines: number[] = filter.LineNumbers || filter.lineNumbers || [];
                            for (const ln of lines) {
                                if (!statsMap[ln]) statsMap[ln] = { active: 0, completed: 0, failed: 0 };
                                const isActive = ['InProgress', 'Dispatching', 'Pending'].includes(s.status);
                                if (isActive) statsMap[ln].active += (s.inProgressCount ?? 0) + (s.queuedCount ?? 0);
                                statsMap[ln].completed += (s.completedCount ?? 0);
                                statsMap[ln].failed += (s.failedCount ?? 0);
                            }
                        } catch { /* skip bad filter */ }
                    }
                }
                if (mounted.current) setLineDeployStats(statsMap);
            } catch { /* silent */ }
        };
        fetchDeployStats();
        const interval = setInterval(fetchDeployStats, 15000);
        return () => clearInterval(interval);
    }, []);

    
    useEffect(() => {
        if (data && data.lines.length > 0) {
            setExpandedLines(prev => {
                const currentKey = getContextKey();

                
                const currentContextState = prev[currentKey] || { cards: {}, list: {} };

                let hasChanges = false;

                
                const nextContextState = {
                    cards: { ...currentContextState.cards },
                    list: { ...currentContextState.list }
                };

                
                (['cards', 'list'] as const).forEach(mode => {
                    data.lines.forEach(line => {
                        
                        if (nextContextState[mode][line.lineNumber] === undefined) {
                            nextContextState[mode][line.lineNumber] = true;
                            hasChanges = true;
                        }
                    });
                });

                if (hasChanges) {
                    return {
                        ...prev,
                        [currentKey]: nextContextState
                    };
                }
                return prev;
            });
        }

        
        if (lineParam && data && data.total === 0) {
            const targetVersion = version || lastDeletedVersionRef.current;
            if (targetVersion) {
                navigate(`/dashboard/${targetVersion}`, { replace: true })
            } else {
                navigate('/dashboard', { replace: true })
            }
            lastDeletedVersionRef.current = undefined;
        }
    }, [data, lineParam, version, navigate, getContextKey])

    
    const toggleLine = (lineNumber: number) => {
        const currentKey = getContextKey();

        setExpandedLines(prev => {
            const contextState = prev[currentKey] || { cards: {}, list: {} };
            const modeState = contextState[viewMode] || {};
            const currentVal = modeState[lineNumber] ?? true;

            return {
                ...prev,
                [currentKey]: {
                    ...contextState,
                    [viewMode]: {
                        ...modeState,
                        [lineNumber]: !currentVal
                    }
                }
            };
        });
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

    // Software version consistency per line
    const getLineVersionConsistency = (line: LineGroup) => {
        if (!line.pcs || line.pcs.length <= 1) return { consistent: true, versions: [] as string[] };
        const versions = [...new Set(line.pcs.map(pc => pc.modelVersion).filter(Boolean))];
        return { consistent: versions.length <= 1, versions };
    };

    const handleComplianceClick = (lineNumber: number, nonCompliantPCs: FactoryPC[]) => {
        if (nonCompliantPCs.length > 0) {
            setShowComplianceModal({ lineNumber, nonCompliantPCs })
        }
    }

    if (isLineParamInvalid || hasUnknownParams || isNotFound) {
        return <NotFound />
    }

    if (loading && !data) return <div className="main-content" style={{ display: 'flex', justifyContent: 'center', paddingTop: '10rem' }}>Loading...</div>

    const getHeaderText = () => {
        if (version && lineParam && data?.lines.find(l => l.lineNumber.toString() === lineParam)) {
            return `Generation ${version} • Line ${lineParam} `
        }
        if (version) return `Generation ${version} `
        return 'All PCs'
    }

    const availableGenerations = Array.from(
        new Set(
            data?.lines.flatMap(l => l.pcs.map(pc => pc.modelVersion)).filter(Boolean) as string[]
        )
    ).sort((a, b) => a.localeCompare(b))

    const currentTab = (!selectedTab || selectedTab === 'All') && availableGenerations.length > 0 ? availableGenerations[0] : selectedTab;

    const filteredLines = data?.lines.map(line => {
        const filteredPCs = line.pcs.filter(pc => pc.modelVersion === currentTab);

        return {
            ...line,
            pcs: filteredPCs
        }
    }).filter(line => line.pcs.length > 0) || []

    return (
        <div className="main-content">
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        {!version && availableGenerations.length > 0 && (
                            <div style={{
                                display: 'flex',
                                gap: '0.25rem',
                                background: 'var(--bg-main)',
                                padding: '2px',
                                borderRadius: '6px',
                                border: '1px solid var(--border)',
                                maxWidth: '400px',
                                overflowX: 'auto',
                                scrollbarWidth: 'none', 
                                msOverflowStyle: 'none'  
                            }}
                                className="hide-scrollbar"
                            >
                                <style>{`.hide-scrollbar::-webkit-scrollbar { display: none; }`}</style>
                                {availableGenerations.map(gen => (
                                    <button
                                        key={gen}
                                        onClick={() => setSelectedTab(gen)}
                                        style={{
                                            border: 'none',
                                            background: currentTab === gen ? '#3b82f6' : 'transparent',
                                            color: currentTab === gen ? '#fff' : 'var(--text-dim)',
                                            padding: '0.2rem 0.6rem',
                                            borderRadius: '4px',
                                            fontSize: '0.8rem',
                                            fontWeight: 600,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                            whiteSpace: 'nowrap',
                                            flexShrink: 0
                                        }}
                                    >
                                        {gen}
                                    </button>
                                ))}
                            </div>
                        )}
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
            </div>



            <div className="dashboard-scroll-area">
                {filteredLines.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '3.5rem', color: 'var(--text-dim)' }}>
                        <Activity size={40} style={{ opacity: 0.3, marginBottom: '0.875rem' }} />
                        <h3 style={{ fontSize: '1rem', marginBottom: '0.375rem' }}>No units found</h3>
                        <p style={{ fontSize: '0.875rem' }}>There are no active PCs for this selection.</p>
                    </div>
                ) : (
                    filteredLines.map(line => {
                        
                        const isExpanded = expandedLines[contextKey]?.[viewMode]?.[line.lineNumber] ?? true;

                        return (
                            <div key={line.lineNumber} className="line-section">
                                <div className="line-header" style={{ display: 'flex', alignItems: 'center', width: '100%', gap: '0.75rem', cursor: 'pointer' }} onClick={() => toggleLine(line.lineNumber)}>
                                    <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: '0.75rem' }}>
                                        <ChevronRight size={16} className={`line-collapse-icon ${isExpanded ? 'expanded' : ''}`} />
                                        <h2 className="line-header-title">Line {line.lineNumber}</h2>
                                        <div style={{ padding: '0.3rem 0.65rem', background: 'linear-gradient(135deg, var(--bg-hover), var(--bg-panel))', border: '1px solid var(--border)', borderRadius: '12px', fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                                            <span style={{ width: '4px', height: '4px', borderRadius: '50%', background: 'var(--primary)', flexShrink: 0 }} />
                                            {line.pcs.length} Units
                                        </div>

                                        {/* Software Version Consistency Indicator */}
                                        {(() => {
                                            const vc = getLineVersionConsistency(line);
                                            if (line.pcs.length > 1) {
                                                return vc.consistent ? (
                                                    <div style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.6rem', fontWeight: 600, background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                                                        <CheckCircle size={10} /> Consistent
                                                    </div>
                                                ) : (
                                                    <div style={{ padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.6rem', fontWeight: 600, background: 'rgba(234,179,8,0.1)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)', display: 'flex', alignItems: 'center', gap: '0.2rem' }} title={`Versions: ${vc.versions.join(', ')}`}>
                                                        <AlertTriangle size={10} /> Version Mismatch
                                                    </div>
                                                );
                                            }
                                            return null;
                                        })()}

                                        {/* Deployment Stats Badges */}
                                        {(() => {
                                            const stats = lineDeployStats[line.lineNumber];
                                            if (!stats) return null;
                                            return (
                                                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                                    {stats.active > 0 && (
                                                        <span style={{ fontSize: '0.58rem', padding: '1px 5px', borderRadius: '4px', fontWeight: 600, background: 'rgba(59,130,246,0.12)', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                            ↻ {stats.active}
                                                        </span>
                                                    )}
                                                    {stats.completed > 0 && (
                                                        <span style={{ fontSize: '0.58rem', padding: '1px 5px', borderRadius: '4px', fontWeight: 600, background: 'rgba(34,197,94,0.12)', color: '#22c55e', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                            ✓ {stats.completed}
                                                        </span>
                                                    )}
                                                    {stats.failed > 0 && (
                                                        <span className="pulse" style={{ fontSize: '0.58rem', padding: '1px 5px', borderRadius: '4px', fontWeight: 600, background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                            ✕ {stats.failed}
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })()}

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
                                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                                            <button className="btn btn-primary" style={{ fontSize: '0.7rem', padding: '0.35rem 0.75rem', height: 'auto' }} onClick={(e) => { e.stopPropagation(); setManagingLine(line.lineNumber) }}>
                                                Manage Models
                                            </button>
                                            <button className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '0.35rem 0.75rem', height: 'auto', display: 'flex', alignItems: 'center', gap: '0.25rem' }} onClick={(e) => { e.stopPropagation(); setUpdatingLine(line.lineNumber) }}>
                                                <RefreshCw size={11} /> Update Software
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className={`line-content ${isExpanded ? '' : 'collapsed'}`}>
                                    {viewMode === 'cards' ? (
                                        <div className="pc-grid">
                                            {line.pcs.map(pc => <MCCard key={pc.mcId} pc={pc} onClick={setSelectedPC} showVersion={false} />)}
                                        </div>
                                    ) : (
                                        <div className="table-container">
                                            <table className="data-table">
                                                <thead>
                                                    <tr>
                                                        <th>MC No.</th>
                                                        <th>IP Address</th>
                                                        <th>Status</th>
                                                        <th>Application</th>
                                                        <th>Current Model</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {line.pcs.map(pc => (
                                                        <tr key={pc.mcId} onClick={() => setSelectedPC(pc)}>

                                                            <td style={{ fontWeight: 600 }}>MC-{pc.mcNumber}</td>
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
                        )
                    })
                )}
            </div>

            {selectedPC && <MCDetailsModal
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
            {updatingLine !== null && (
                <LineSoftwareUpdateModal
                    lineNumber={updatingLine}
                    version={version}
                    onClose={() => setUpdatingLine(null)}
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
                                            <tr key={pc.mcId} onClick={() => { setShowComplianceModal(null); setSelectedPC(pc) }}>
                                                <td style={{ fontWeight: 600 }}>MC-{pc.mcNumber}</td>
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