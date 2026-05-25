import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Rocket, CheckCircle, XCircle, Clock, AlertTriangle,
    ChevronDown, ChevronUp, Undo2, Ban, RefreshCw, X, Wifi, WifiOff
} from 'lucide-react';
import { HubConnectionBuilder, HubConnection, LogLevel } from '@microsoft/signalr';
import { updateApi } from '../../services/updateApi';
import { factoryApi } from '../../services/api';
import type {
    UpdatePackage, UpdateSchedule, ScheduleDetailResponse,
    CreateScheduleRequest
} from '../../types/updateTypes';

interface Props {
    lineNumber: number;
    version?: string;
    onClose: () => void;
}

const DEPLOY_PHASES = ['Queued', 'Dispatched', 'Downloading', 'Installing', 'Completed'] as const;
const ROLLBACK_PHASES = ['Queued', 'Dispatched', 'Installing', 'Completed'] as const;

function PhaseStepperInline({ status, isRollback }: { status: string; isRollback?: boolean }) {
    const isFailed = status === 'Failed';
    const isBlocked = status === 'Blocked';
    const isCancelled = status === 'Cancelled' || status === 'Skipped';

    if (isBlocked || isCancelled) return null;

    const phases = isRollback ? ROLLBACK_PHASES : DEPLOY_PHASES;
    const mappedStatus = isRollback && status === 'Downloading' ? 'Installing' : status;
    const currentIdx = phases.indexOf(mappedStatus as any);
    const activeIdx = isFailed ? -1 : currentIdx;
    const accentColor = isRollback ? 'var(--warning)' : 'var(--primary)';

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginTop: '3px' }}>
            {phases.map((phase, i) => {
                let bg = 'var(--border)';
                let opacity = 0.4;

                if (isFailed) {
                    if (i <= Math.max(currentIdx, 0)) {
                        bg = 'var(--error)';
                        opacity = 1;
                    }
                } else if (i < activeIdx) {
                    bg = 'var(--success)';
                    opacity = 1;
                } else if (i === activeIdx) {
                    bg = status === 'Completed' ? 'var(--success)' : accentColor;
                    opacity = 1;
                }

                return (
                    <div
                        key={phase}
                        title={isRollback && phase === 'Installing' ? 'Restoring' : phase}
                        style={{
                            width: i === activeIdx && status !== 'Completed' ? '16px' : '10px',
                            height: '3px',
                            borderRadius: '2px',
                            background: bg,
                            opacity,
                            transition: 'all 0.3s ease',
                        }}
                    />
                );
            })}
        </div>
    );
}

export default function LineSoftwareUpdateModal({ lineNumber, version, onClose }: Props) {
    
    const [activeTab, setActiveTab] = useState<'Bundle' | 'LAI'>('Bundle');
    const [packages, setPackages] = useState<UpdatePackage[]>([]);
    const [selectedPkgId, setSelectedPkgId] = useState<number>(0);
    const [deploying, setDeploying] = useState(false);
    const [deployMsg, setDeployMsg] = useState('');
    const [offlineCount, setOfflineCount] = useState(0);

    const [schedules, setSchedules] = useState<UpdateSchedule[]>([]);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<ScheduleDetailResponse | null>(null);

    const [loading, setLoading] = useState(true);
    const [liveConnected, setLiveConnected] = useState(false);
    const [rollbackPending, setRollbackPending] = useState(false);
    const [rollbackConfirmId, setRollbackConfirmId] = useState<number | null>(null);
    const connectionRef = useRef<HubConnection | null>(null);
    const expandedIdRef = useRef<number | null>(null);

    useEffect(() => { expandedIdRef.current = expandedId; }, [expandedId]);

    const refreshDetail = useCallback(async (scheduleId?: number) => {
        const id = scheduleId ?? expandedIdRef.current;
        if (!id) return;
        try {
            const d = await updateApi.getScheduleDetail(id);
            setDetail(d);
        } catch { }
    }, []);

    const loadData = useCallback(async (initial = false) => {
        if (initial) setLoading(true);
        try {
            const [pkgRes, schedRes, pcRes] = await Promise.all([
                updateApi.getPackages(undefined, undefined, 1, 50),
                updateApi.getSchedules(undefined, 1, 50),
                factoryApi.getPCs(version, lineNumber)
            ]);
            setPackages(pkgRes.packages);
            
            const linePCs = pcRes.lines.flatMap(l => l.pcs);
            setOfflineCount(linePCs.filter(p => !p.isOnline).length);

            const lineSchedules = schedRes.schedules.filter(s => {
                if (s.targetType === 'ByLine') {
                    try {
                        const filter = s.targetFilter ? JSON.parse(s.targetFilter) : {};
                        if (filter.LineNumbers?.includes(lineNumber) || filter.lineNumbers?.includes(lineNumber)) {
                            if (version && filter.Version && filter.Version !== version && filter.version !== version) return false;
                            return true;
                        }
                    } catch {
                        if (s.targetFilter === lineNumber.toString()) return true;
                    }
                }
                if (s.targetType === 'All') return true;
                return false;
            });
            setSchedules(lineSchedules);

            if (expandedIdRef.current) {
                await refreshDetail();
            }

        } catch {  }
        if (initial) setLoading(false);
    }, [lineNumber, version, refreshDetail]);

    useEffect(() => {
        loadData(true);
    }, [loadData]);

    useEffect(() => {
        const connection = new HubConnectionBuilder()
            .withUrl('/agentHub')
            .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
            .configureLogging(LogLevel.Warning)
            .build();

        connectionRef.current = connection;

        connection.on('DeploymentStatusChanged', (data: any) => {
            setDetail(prev => {
                if (!prev || prev.schedule.updateScheduleId !== data.scheduleId) return prev;
                const updatedDeployments = prev.deployments.map(d => {
                    if (d.updateDeploymentId === data.deploymentId) {
                        return { 
                            ...d, 
                            status: data.status, 
                            errorMessage: data.errorMessage 
                        };
                    }
                    return d;
                });
                return { ...prev, deployments: updatedDeployments };
            });
        });

        connection.on('ScheduleStatusChanged', (data: any) => {
            setSchedules(prev => prev.map(s => {
                if (s.updateScheduleId === data.scheduleId) {
                    return { ...s, status: data.status, haltReason: data.haltReason, completedDateUtc: data.completedDateUtc };
                }
                return s;
            }));
            
            setDetail(prev => {
                if (!prev || prev.schedule.updateScheduleId !== data.scheduleId) return prev;
                return { 
                    ...prev, 
                    schedule: { 
                        ...prev.schedule, 
                        status: data.status, 
                        haltReason: data.haltReason, 
                        completedDateUtc: data.completedDateUtc 
                    } 
                };
            });
        });

        connection.on('DeploymentStatusUpdate', (_data: any) => {
            // Deprecated callback or unformatted fallback
        });

        connection.onreconnected(() => {
            setLiveConnected(true);
            loadData(false);
        });

        connection.onclose(() => {
            setLiveConnected(false);
        });

        connection.start()
            .then(() => setLiveConnected(true))
            .catch(err => {
                console.warn('[LineSoftwareUpdate] SignalR connection failed, using polling fallback:', err);
                setLiveConnected(false);
            });

        return () => {
            connection.stop().catch(() => {});
        };
    }, [loadData]);

    const handleDeploy = async () => {
        if (!selectedPkgId) return;
        setDeploying(true);
        setDeployMsg('');
        try {
            const pkg = packages.find(p => p.updatePackageId === selectedPkgId);
            const request: CreateScheduleRequest = {
                packageId: selectedPkgId,
                scheduleName: `${pkg?.packageType || 'Package'} v${pkg?.version} → Line ${lineNumber}`,
                targetType: 'ByLine',
                targetFilter: JSON.stringify({ LineNumbers: [lineNumber], Version: version || undefined }),
                scheduleType: 'Immediate',
            };
            const result = await updateApi.createSchedule(request);
            setDeployMsg(`Deployed! ${result.targetCount} MCs targeted.`);
            setSelectedPkgId(0);
            await loadData(false);
        } catch (e: any) {
            setDeployMsg(`Error: ${e.message}`);
        } finally {
            setDeploying(false);
        }
    };

    const toggleExpand = async (id: number) => {
        if (expandedId === id) { setExpandedId(null); setDetail(null); return; }
        setExpandedId(id);
        try { setDetail(await updateApi.getScheduleDetail(id)); } catch {  }
    };

    const handleRollback = async (scheduleId: number) => {
        setRollbackPending(true);
        setRollbackConfirmId(null);
        try {
            const resp = await updateApi.rollbackSchedule(scheduleId);
            setDeployMsg(`Rollback initiated for ${resp.targetCount ?? '?'} machines.`);
            await loadData(false);
        } catch (e: any) {
            const msg = e?.response?.data?.message || e.message || 'Unknown error';
            setDeployMsg(`Rollback failed: ${msg}`);
        } finally {
            setRollbackPending(false);
        }
    };

    const statusIcon = (status: string, size = 12) => {
        switch (status) {
            case 'Completed': return <CheckCircle size={size} style={{ color: 'var(--success)' }} />;
            case 'Failed': return <XCircle size={size} style={{ color: 'var(--error)' }} />;
            case 'Halted': return <AlertTriangle size={size} style={{ color: 'var(--warning)' }} />;
            case 'InProgress': case 'Dispatched': case 'Dispatching':
            case 'Downloading': case 'Installing':
                return <Clock size={size} style={{ color: 'var(--primary)' }} />;
            case 'Blocked': return <Ban size={size} style={{ color: 'var(--text-dim)' }} />;
            default: return <Clock size={size} style={{ color: 'var(--text-dim)' }} />;
        }
    };

    const statusColor = (status: string): string => {
        switch (status) {
            case 'Completed': return 'var(--success)';
            case 'Failed': return 'var(--error)';
            case 'Halted': return 'var(--warning)';
            case 'InProgress': case 'Dispatched': case 'Dispatching':
            case 'Downloading': case 'Installing': return 'var(--primary)';
            default: return 'var(--text-dim)';
        }
    };

    const canRollback = (schedule: UpdateSchedule) => {
        const rollbackable = ['Completed', 'PartiallyCompleted', 'Failed', 'Halted'];
        if (!rollbackable.includes(schedule.status)) return false;
        if (schedule.isRollback) return false;
        const hasExistingRollback = schedules.some(
            s => s.isRollback && s.originalScheduleId === schedule.updateScheduleId
                && s.status !== 'Cancelled'
        );
        return !hasExistingRollback;
    };

    const statusEmoji: Record<string, string> = {
        Completed: '✅', Failed: '❌', Blocked: '🚫', Queued: '⏸',
        Dispatched: '⏳', Downloading: '⬇️', Installing: '🔧', Skipped: '⏭', Cancelled: '🚫'
    };

    const phaseLabel = (status: string, isRollback?: boolean): string => {
        if (isRollback) {
            switch (status) {
                case 'Queued': return 'Waiting…';
                case 'Dispatched': return 'Dispatched';
                case 'Downloading': return 'Restoring…';
                case 'Installing': return 'Replacing…';
                case 'Completed': return 'Rolled back';
                case 'Failed': return 'Failed';
                case 'Blocked': return 'Blocked';
                default: return status;
            }
        }
        switch (status) {
            case 'Queued': return 'Waiting…';
            case 'Dispatched': return 'Dispatched';
            case 'Downloading': return 'Downloading…';
            case 'Installing': return 'Installing…';
            case 'Completed': return 'Completed';
            case 'Failed': return 'Failed';
            case 'Blocked': return 'Blocked';
            default: return status;
        }
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div
                className="modal-content animate-scale-in"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: '580px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
            >
                {}
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <RefreshCw size={18} color="var(--primary)" />
                        <div>
                            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                                Line {lineNumber} — Software Update
                            </h2>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                {version && (
                                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                        Generation {version}
                                    </span>
                                )}
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                                    fontSize: '0.58rem', padding: '1px 5px', borderRadius: '8px',
                                    background: liveConnected ? 'rgba(34,197,94,0.1)' : 'rgba(255,100,100,0.1)',
                                    color: liveConnected ? 'var(--success)' : 'var(--text-dim)',
                                    fontWeight: 600
                                }}>
                                    {liveConnected
                                        ? <><Wifi size={8} /> LIVE</>
                                        : <><WifiOff size={8} /> POLLING</>}
                                </span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="btn btn-secondary btn-icon"><X size={18} /></button>
                </div>

                {}
                <div className="modal-body" style={{ overflowY: 'auto', padding: '0.75rem 1rem' }}>
                    {loading ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.8rem' }}>
                            <div className="editor-loading-spinner" style={{ width: 20, height: 20, margin: '0 auto 0.5rem' }} />
                            Loading...
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                            {}
                            <div style={{
                                background: 'var(--bg-secondary)', borderRadius: '8px',
                                border: '1px solid var(--border)', padding: '0.6rem 0.75rem'
                            }}>
                                <div style={{
                                    fontSize: '0.72rem', fontWeight: 600, color: 'var(--text)',
                                    marginBottom: '0.4rem', display: 'flex', alignItems: 'center', gap: '0.3rem'
                                }}>
                                    <Rocket size={13} style={{ color: 'var(--primary)' }} />
                                    Deploy Software
                                </div>
                                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                                    <select
                                        value={activeTab === 'Bundle' && selectedPkgId ? selectedPkgId : 0}
                                        onChange={e => { setActiveTab('Bundle'); setSelectedPkgId(Number(e.target.value)); }}
                                        style={{
                                            flex: 1, padding: '0.3rem 0.4rem', borderRadius: '5px',
                                            border: '1px solid var(--border)', background: 'var(--card-bg)',
                                            color: 'var(--text)', fontSize: '0.72rem'
                                        }}
                                    >
                                        <option value={0}>Select Bundle package...</option>
                                        {packages.filter(p => p.packageType === 'Bundle').map(p => (
                                            <option key={p.updatePackageId} value={p.updatePackageId}>
                                                v{p.version}
                                            </option>
                                        ))}
                                    </select>
                                    <select
                                        value={activeTab === 'LAI' && selectedPkgId ? selectedPkgId : 0}
                                        onChange={e => { setActiveTab('LAI'); setSelectedPkgId(Number(e.target.value)); }}
                                        style={{
                                            flex: 1, padding: '0.3rem 0.4rem', borderRadius: '5px',
                                            border: '1px solid var(--border)', background: 'var(--card-bg)',
                                            color: 'var(--text)', fontSize: '0.72rem'
                                        }}
                                    >
                                        <option value={0}>Select LAI package...</option>
                                        {packages.filter(p => p.packageType === 'LAI').map(p => (
                                            <option key={p.updatePackageId} value={p.updatePackageId}>
                                                v{p.version}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={handleDeploy}
                                        disabled={deploying || !selectedPkgId || offlineCount > 0}
                                        className="btn btn-success"
                                        style={{ fontSize: '0.7rem', padding: '0.28rem 0.6rem', whiteSpace: 'nowrap', opacity: offlineCount > 0 ? 0.5 : 1 }}
                                    >
                                        <Rocket size={11} /> {deploying ? 'Deploying...' : 'Deploy'}
                                    </button>
                                </div>
                                {offlineCount > 0 && (
                                    <div style={{
                                        marginTop: '0.5rem', fontSize: '0.7rem', padding: '0.35rem 0.5rem',
                                        borderRadius: '4px', display: 'flex', gap: '0.3rem', alignItems: 'flex-start',
                                        color: 'var(--warning)', background: 'rgba(255,165,0,0.08)', border: '1px solid rgba(255,165,0,0.2)'
                                    }}>
                                        <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: '2px' }} />
                                        <div>
                                            <strong>Deployment Blocked:</strong> All machines in Line {lineNumber} must be online to deploy. 
                                            Currently, {offlineCount} machine{offlineCount > 1 ? 's are' : ' is'} offline.
                                        </div>
                                    </div>
                                )}
                                {deployMsg && (
                                    <div style={{
                                        marginTop: '0.35rem', fontSize: '0.7rem', padding: '0.25rem 0.5rem',
                                        borderRadius: '4px',
                                        color: deployMsg.startsWith('Error') ? 'var(--error)' : 'var(--success)',
                                        background: deployMsg.startsWith('Error') ? 'rgba(255,100,100,0.06)' : 'rgba(34,197,94,0.06)'
                                    }}>
                                        {deployMsg}
                                    </div>
                                )}
                            </div>

                            {}
                            {schedules.length > 0 && (
                                <div>
                                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.5rem', borderBottom: '1px solid var(--border)' }}>
                                        <button 
                                            onClick={() => setActiveTab('Bundle')}
                                            style={{
                                                background: 'none', border: 'none', padding: '0.4rem 0',
                                                fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                                color: activeTab === 'Bundle' ? 'var(--primary)' : 'var(--text-dim)',
                                                borderBottom: activeTab === 'Bundle' ? '2px solid var(--primary)' : '2px solid transparent',
                                                textTransform: 'uppercase', letterSpacing: '0.03em'
                                            }}
                                        >
                                            Bundle Deployments
                                        </button>
                                        <button 
                                            onClick={() => setActiveTab('LAI')}
                                            style={{
                                                background: 'none', border: 'none', padding: '0.4rem 0',
                                                fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer',
                                                color: activeTab === 'LAI' ? 'var(--primary)' : 'var(--text-dim)',
                                                borderBottom: activeTab === 'LAI' ? '2px solid var(--primary)' : '2px solid transparent',
                                                textTransform: 'uppercase', letterSpacing: '0.03em'
                                            }}
                                        >
                                            LAI Deployments
                                        </button>
                                    </div>
                                    <div style={{
                                        background: 'var(--bg-secondary)', borderRadius: '8px',
                                        border: '1px solid var(--border)', overflow: 'hidden'
                                    }}>
                                        {schedules.filter(s => s.packageType === activeTab).length === 0 ? (
                                            <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.72rem' }}>
                                                No {activeTab} deployments found.
                                            </div>
                                        ) : (
                                            schedules.filter(s => s.packageType === activeTab).slice(0, 5).map((schedule, idx) => (
                                                <div key={schedule.updateScheduleId} style={{
                                                    borderBottom: idx < Math.min(schedules.filter(s => s.packageType === activeTab).length, 5) - 1 ? '1px solid var(--border)' : 'none'
                                                }}>
                                                {}
                                                <div
                                                    onClick={() => toggleExpand(schedule.updateScheduleId)}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                        padding: '0.4rem 0.65rem', cursor: 'pointer', fontSize: '0.72rem'
                                                    }}
                                                >
                                                    {statusIcon(schedule.status)}
                                                    <span style={{ fontWeight: 600, color: 'var(--text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {schedule.scheduleName}
                                                        {schedule.isRollback && (
                                                            <span style={{
                                                                marginLeft: '0.3rem', fontSize: '0.55rem',
                                                                padding: '0px 4px', background: 'rgba(255,165,0,0.12)',
                                                                color: 'var(--warning)', borderRadius: '3px'
                                                            }}>ROLLBACK</span>
                                                        )}
                                                    </span>
                                                    <span style={{ fontSize: '0.62rem', color: 'var(--text-dim)', whiteSpace: 'nowrap', display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                                                        {schedule.totalTargetCount} total
                                                        {(schedule.completedCount ?? 0) > 0 && <span style={{ color: 'var(--success)' }}>{schedule.completedCount}✓</span>}
                                                        {(schedule.failedCount ?? 0) > 0 && <span style={{ color: 'var(--error)' }}>{schedule.failedCount}✕</span>}
                                                        {(schedule.inProgressCount ?? 0) > 0 && <span style={{ color: 'var(--primary)' }}>{schedule.inProgressCount}↻</span>}
                                                    </span>
                                                    <span style={{
                                                        fontSize: '0.58rem', padding: '1px 5px', borderRadius: '3px',
                                                        fontWeight: 600, background: `${statusColor(schedule.status)}15`,
                                                        color: statusColor(schedule.status)
                                                    }}>
                                                        {schedule.status}
                                                    </span>
                                                    {canRollback(schedule) && idx === 0 && (
                                                        rollbackConfirmId === schedule.updateScheduleId ? (
                                                            <div style={{
                                                                display: 'flex', alignItems: 'center', gap: '3px',
                                                                animation: 'fadeIn 0.2s ease'
                                                            }}>
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); handleRollback(schedule.updateScheduleId); }}
                                                                    disabled={rollbackPending}
                                                                    style={{
                                                                        background: 'var(--warning)', border: 'none',
                                                                        borderRadius: '4px', padding: '2px 6px', cursor: rollbackPending ? 'wait' : 'pointer',
                                                                        color: '#fff', fontSize: '0.58rem', fontWeight: 700,
                                                                        opacity: rollbackPending ? 0.6 : 1
                                                                    }}
                                                                >
                                                                    {rollbackPending ? '...' : 'Confirm'}
                                                                </button>
                                                                <button
                                                                    onClick={e => { e.stopPropagation(); setRollbackConfirmId(null); }}
                                                                    style={{
                                                                        background: 'transparent', border: '1px solid var(--border)',
                                                                        borderRadius: '4px', padding: '2px 5px', cursor: 'pointer',
                                                                        color: 'var(--text-dim)', fontSize: '0.58rem', fontWeight: 600
                                                                    }}
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button
                                                                onClick={e => { e.stopPropagation(); setRollbackConfirmId(schedule.updateScheduleId); }}
                                                                title="Rollback"
                                                                style={{
                                                                    background: 'rgba(255,165,0,0.08)', border: '1px solid var(--warning)',
                                                                    borderRadius: '4px', padding: '2px 5px', cursor: 'pointer',
                                                                    color: 'var(--warning)', fontSize: '0.58rem', fontWeight: 600,
                                                                    display: 'flex', alignItems: 'center', gap: '2px'
                                                                }}
                                                            >
                                                                <Undo2 size={9} /> Rollback
                                                            </button>
                                                        )
                                                    )}
                                                    {expandedId === schedule.updateScheduleId
                                                        ? <ChevronUp size={11} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
                                                        : <ChevronDown size={11} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />}
                                                </div>

                                                {}
                                                {schedule.status === 'Halted' && schedule.haltReason && (
                                                    <div style={{
                                                        padding: '0.2rem 0.65rem', background: 'rgba(255,165,0,0.06)',
                                                        color: 'var(--warning)', fontSize: '0.62rem',
                                                        display: 'flex', alignItems: 'center', gap: '0.25rem'
                                                    }}>
                                                        <AlertTriangle size={9} /> {schedule.haltReason}
                                                    </div>
                                                )}

                                                {}
                                                {expandedId === schedule.updateScheduleId && detail && (
                                                    <div style={{
                                                        padding: '0.25rem 0.65rem 0.4rem 1rem',
                                                        background: 'var(--bg-app)'
                                                    }}>
                                                        {}
                                                        <div style={{
                                                            display: 'flex', gap: '0.5rem', padding: '0.3rem 0 0.4rem',
                                                            fontSize: '0.6rem', color: 'var(--text-dim)',
                                                            borderBottom: '1px solid var(--border)', marginBottom: '0.2rem'
                                                        }}>
                                                            <span>MC</span>
                                                            <span style={{ flex: 1 }}>Phase</span>
                                                            <span>Progress</span>
                                                        </div>

                                                        {detail.deployments
                                                            .sort((a, b) => (a.executionOrder ?? 0) - (b.executionOrder ?? 0))
                                                            .map(dep => (
                                                                <div key={dep.updateDeploymentId} style={{
                                                                    display: 'flex', alignItems: 'flex-start', gap: '0.4rem',
                                                                    padding: '0.3rem 0', fontSize: '0.68rem',
                                                                    opacity: dep.status === 'Blocked' ? 0.45 : 1,
                                                                    borderBottom: '1px solid var(--border)',
                                                                    transition: 'opacity 0.3s ease'
                                                                }}>
                                                                    <span style={{ width: '1.2rem', textAlign: 'center', fontSize: '0.72rem' }}>
                                                                        {statusEmoji[dep.status] ?? '⏸'}
                                                                    </span>
                                                                    <div style={{ width: '3.5rem' }}>
                                                                        <div style={{ fontWeight: 700, color: 'var(--text)' }}>
                                                                            MC-{dep.mcNumber ?? dep.mcId}
                                                                        </div>
                                                                        <PhaseStepperInline status={dep.status} isRollback={detail.schedule?.isRollback} />
                                                                    </div>
                                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                                        <span style={{
                                                                            color: statusColor(dep.status),
                                                                            fontWeight: 600,
                                                                            fontSize: '0.64rem'
                                                                        }}>
                                                                            {phaseLabel(dep.status, detail.schedule?.isRollback)}
                                                                        </span>
                                                                        {dep.errorMessage && (
                                                                            <div style={{
                                                                                color: 'var(--error)', fontSize: '0.58rem',
                                                                                marginTop: '1px', overflow: 'hidden',
                                                                                textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                                                            }}>
                                                                                {dep.errorMessage}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', minWidth: '3.5rem' }}>
                                                                        {dep.previousVersion && (
                                                                            <span style={{ fontSize: '0.52rem', color: 'var(--text-dim)', opacity: 0.8 }}>
                                                                                was v{dep.previousVersion}
                                                                            </span>
                                                                        )}
                                                                        {dep.reportedAgentVersion && (
                                                                            <span style={{ fontSize: '0.52rem', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.1)', padding: '1px 3px', borderRadius: '3px' }}>
                                                                                Ag:{dep.reportedAgentVersion}
                                                                            </span>
                                                                        )}
                                                                        {dep.reportedServiceVersion && (
                                                                            <span style={{ fontSize: '0.52rem', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.1)', padding: '1px 3px', borderRadius: '3px' }}>
                                                                                Svc:{dep.reportedServiceVersion}
                                                                            </span>
                                                                        )}
                                                                        {dep.attemptCount > 1 && (
                                                                            <span style={{ fontSize: '0.5rem', color: 'var(--warning)', border: '1px solid var(--warning)', borderRadius: '3px', padding: '0px 3px' }}>
                                                                                Try {dep.attemptCount}/{dep.maxAttempts}
                                                                            </span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                    </div>
                                                )}
                                            </div>
                                        )))}
                                    </div>
                                </div>
                            )}

                            {}
                            {schedules.length === 0 && (
                                <div style={{
                                    padding: '1.5rem', textAlign: 'center', color: 'var(--text-dim)',
                                    fontSize: '0.78rem', border: '2px dashed var(--border)',
                                    borderRadius: '8px'
                                }}>
                                    <Rocket size={28} style={{ opacity: 0.2, marginBottom: '0.4rem' }} />
                                    <div>No deployments yet for this line.</div>
                                    <div style={{ fontSize: '0.68rem', marginTop: '0.2rem' }}>
                                        Select a package above to deploy.
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
