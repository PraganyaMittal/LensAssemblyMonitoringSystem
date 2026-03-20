import { useState, useEffect, useCallback, useRef } from 'react';
import {
    Rocket, CheckCircle, XCircle, Clock, AlertTriangle,
    ChevronDown, ChevronUp, Undo2, Ban, RefreshCw, X
} from 'lucide-react';
import { updateApi } from '../../services/updateApi';
import type {
    UpdatePackage, UpdateSchedule, ScheduleDetailResponse,
    CreateScheduleRequest
} from '../../types/updateTypes';

interface Props {
    lineNumber: number;
    version?: string;
    onClose: () => void;
}

export default function LineSoftwareUpdateModal({ lineNumber, version, onClose }: Props) {
    
    const [activeTab, setActiveTab] = useState<'Bundle' | 'LAI'>('Bundle');
    const [packages, setPackages] = useState<UpdatePackage[]>([]);
    const [selectedPkgId, setSelectedPkgId] = useState<number>(0);
    const [deploying, setDeploying] = useState(false);
    const [deployMsg, setDeployMsg] = useState('');

    const [schedules, setSchedules] = useState<UpdateSchedule[]>([]);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<ScheduleDetailResponse | null>(null);

    const [loading, setLoading] = useState(true);
    const pollingRef = useRef<any>(null);

    const loadData = useCallback(async (initial = false) => {
        if (initial) setLoading(true);
        try {
            const [pkgRes, schedRes] = await Promise.all([
                updateApi.getPackages(undefined, undefined, 1, 50),
                updateApi.getSchedules(undefined, 1, 50),
            ]);
            setPackages(pkgRes.packages);

            const lineSchedules = schedRes.schedules.filter(s => {
                if (s.targetType === 'ByLine') {
                    try {
                        const filter = s.targetFilter ? JSON.parse(s.targetFilter) : {};
                        if (filter.LineNumbers?.includes(lineNumber) || filter.lineNumbers?.includes(lineNumber)) return true;
                    } catch {
                        if (s.targetFilter === lineNumber.toString()) return true;
                    }
                }
                if (s.targetType === 'All') return true;
                return false;
            });
            setSchedules(lineSchedules);

        } catch {  }
        if (initial) setLoading(false);
    }, [lineNumber]);

    useEffect(() => {
        loadData(true);
        pollingRef.current = setInterval(() => loadData(false), 8000);
        return () => clearInterval(pollingRef.current);
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
                targetFilter: JSON.stringify({ LineNumbers: [lineNumber] }),
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
        if (!confirm('Roll back all successfully-updated machines on this line?')) return;
        try {
            await updateApi.rollbackSchedule(scheduleId);
            setDeployMsg('Rollback initiated successfully.');
            await loadData(false);
        } catch (e: any) {
            setDeployMsg(`Rollback error: ${e.message}`);
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

    const canRollback = (s: string) => s === 'Completed' || s === 'Halted';

    const statusEmoji: Record<string, string> = {
        Completed: '✅', Failed: '❌', Blocked: '🚫', Queued: '⏸',
        Dispatched: '⏳', Downloading: '⏳', Installing: '⏳', Skipped: '⏭', Cancelled: '🚫'
    };

    return (
        <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1100 }}>
            <div
                className="modal-content animate-scale-in"
                onClick={e => e.stopPropagation()}
                style={{ maxWidth: '540px', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
            >
                {}
                <div className="modal-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <RefreshCw size={18} color="var(--primary)" />
                        <div>
                            <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>
                                Line {lineNumber} — Software Update
                            </h2>
                            {version && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                    Generation {version}
                                </div>
                            )}
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
                                        value={selectedPkgId}
                                        onChange={e => setSelectedPkgId(Number(e.target.value))}
                                        style={{
                                            flex: 1, padding: '0.3rem 0.4rem', borderRadius: '5px',
                                            border: '1px solid var(--border)', background: 'var(--card-bg)',
                                            color: 'var(--text)', fontSize: '0.72rem'
                                        }}
                                    >
                                        <option value={0}>Select package...</option>
                                        {packages.map(p => (
                                            <option key={p.updatePackageId} value={p.updatePackageId}>
                                                {p.packageType} v{p.version}
                                            </option>
                                        ))}
                                    </select>
                                    <button
                                        onClick={handleDeploy}
                                        disabled={deploying || !selectedPkgId}
                                        className="btn btn-success"
                                        style={{ fontSize: '0.7rem', padding: '0.28rem 0.6rem', whiteSpace: 'nowrap' }}
                                    >
                                        <Rocket size={11} /> {deploying ? 'Deploying...' : 'Deploy'}
                                    </button>
                                </div>
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
                                                    {canRollback(schedule.status) && !schedule.isRollback && idx === 0 && (
                                                        <button
                                                            onClick={e => { e.stopPropagation(); handleRollback(schedule.updateScheduleId); }}
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
                                                        padding: '0.25rem 0.65rem 0.4rem 1.5rem',
                                                        background: 'var(--bg-app)'
                                                    }}>
                                                        {detail.deployments
                                                            .sort((a, b) => (a.executionOrder ?? 0) - (b.executionOrder ?? 0))
                                                            .map(dep => (
                                                                <div key={dep.updateDeploymentId} style={{
                                                                    display: 'flex', alignItems: 'center', gap: '0.4rem',
                                                                    padding: '0.2rem 0', fontSize: '0.68rem',
                                                                    opacity: dep.status === 'Blocked' ? 0.5 : 1,
                                                                    borderBottom: '1px solid var(--border)'
                                                                }}>
                                                                    <span style={{ width: '1rem', textAlign: 'center' }}>
                                                                        {statusEmoji[dep.status] ?? '⏸'}
                                                                    </span>
                                                                    <span style={{ fontWeight: 600, color: 'var(--text)', width: '4rem' }}>
                                                                        MC-{dep.mcNumber ?? dep.mcId}
                                                                    </span>
                                                                    <span style={{ flex: 1, color: 'var(--text-dim)' }}>
                                                                        {dep.status}
                                                                        {dep.errorMessage && (
                                                                            <span style={{ color: 'var(--error)', marginLeft: '0.25rem' }}>
                                                                                — {dep.errorMessage}
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center', minWidth: '4rem' }}>
                                                                        {dep.previousVersion && (
                                                                            <span style={{ fontSize: '0.55rem', color: 'var(--text-dim)', opacity: 0.8 }}>
                                                                                was v{dep.previousVersion}
                                                                            </span>
                                                                        )}
                                                                        {dep.reportedAgentVersion && (
                                                                            <span style={{ fontSize: '0.55rem', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.1)', padding: '1px 4px', borderRadius: '3px' }}>
                                                                                Ag:v{dep.reportedAgentVersion}
                                                                            </span>
                                                                        )}
                                                                        {dep.reportedServiceVersion && (
                                                                            <span style={{ fontSize: '0.55rem', color: 'var(--text-dim)', background: 'rgba(0,0,0,0.1)', padding: '1px 4px', borderRadius: '3px' }}>
                                                                                Svc:v{dep.reportedServiceVersion}
                                                                            </span>
                                                                        )}
                                                                        {dep.attemptCount > 1 && (
                                                                            <span style={{ fontSize: '0.52rem', color: 'var(--warning)', border: '1px solid var(--warning)', borderRadius: '3px', padding: '0px 3px' }}>
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
