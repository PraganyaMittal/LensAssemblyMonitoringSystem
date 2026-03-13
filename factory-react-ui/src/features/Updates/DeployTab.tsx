import { useState, useEffect, useCallback } from 'react';
import { Rocket, CheckCircle, XCircle, Clock, Ban, AlertTriangle, ChevronDown, ChevronUp, Undo2 } from 'lucide-react';
import { updateApi } from '../../services/updateApi';
import type { UpdateSchedule, ScheduleDetailResponse, UpdateDeployment } from '../../types/updateTypes';

/**
 * DeployTab — Deployment tab for UpdateManager.
 * Shows per-line deployment with sequential MC-by-MC status.
 * 
 * Features:
 *  - Create deployment (select package + line)
 *  - View active/past deployments with per-MC status
 *  - Rollback button (enabled only on Completed/Halted)
 *  - Halt/Blocked state visualization
 */
export default function DeployTab() {
    const [schedules, setSchedules] = useState<UpdateSchedule[]>([]);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [detail, setDetail] = useState<ScheduleDetailResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const loadSchedules = useCallback(async () => {
        try {
            setLoading(true);
            const res = await updateApi.getSchedules(undefined, 1, 50);
            setSchedules(res.schedules);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadSchedules(); }, [loadSchedules]);

    const toggleExpand = async (id: number) => {
        if (expandedId === id) {
            setExpandedId(null);
            setDetail(null);
            return;
        }
        setExpandedId(id);
        try {
            const res = await updateApi.getScheduleDetail(id);
            setDetail(res);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const handleRollback = async (scheduleId: number) => {
        if (!confirm('This will roll back all successfully-updated machines on this line to their previous version. Proceed?')) return;
        try {
            await updateApi.rollbackSchedule(scheduleId);
            loadSchedules();
        } catch (e: any) {
            setError(e.message);
        }
    };

    const statusIcon = (status: string) => {
        switch (status) {
            case 'Completed': return <CheckCircle size={14} style={{ color: 'var(--success)' }} />;
            case 'Failed': return <XCircle size={14} style={{ color: 'var(--error)' }} />;
            case 'Halted': return <AlertTriangle size={14} style={{ color: 'var(--warning)' }} />;
            case 'InProgress': case 'Dispatched': case 'Downloading': case 'Installing':
                return <Clock size={14} style={{ color: 'var(--primary)' }} />;
            case 'Blocked': return <Ban size={14} style={{ color: 'var(--text-dim)' }} />;
            case 'Queued': return <Clock size={14} style={{ color: 'var(--text-dim)' }} />;
            default: return <Clock size={14} style={{ color: 'var(--text-dim)' }} />;
        }
    };

    const canRollback = (status: string) => status === 'Completed' || status === 'Halted';

    const deploymentStatusColor = (status: string): string => {
        switch (status) {
            case 'Completed': return 'var(--success)';
            case 'Failed': return 'var(--error)';
            case 'Blocked': return 'var(--text-dim)';
            case 'Halted': return 'var(--warning)';
            case 'InProgress': case 'Dispatched': case 'Downloading': case 'Installing':
                return 'var(--primary)';
            default: return 'var(--text-dim)';
        }
    };

    if (loading) return <div style={{ padding: '2rem', color: 'var(--text-dim)' }}>Loading deployments...</div>;

    return (
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {error && (
                <div style={{
                    padding: '0.75rem', background: 'rgba(255,100,100,0.1)', border: '1px solid var(--error)',
                    borderRadius: '8px', color: 'var(--error)', fontSize: '0.8rem'
                }}>
                    {error}
                    <button onClick={() => setError('')} style={{ marginLeft: '1rem', background: 'none', border: 'none', color: 'var(--error)', cursor: 'pointer' }}>✕</button>
                </div>
            )}

            {schedules.length === 0 && (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                    <Rocket size={40} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                    <p>No deployments yet. Create one from the Packages tab.</p>
                </div>
            )}

            {schedules.map(schedule => (
                <div key={schedule.updateScheduleId} style={{
                    background: 'var(--card-bg)', borderRadius: '10px', border: '1px solid var(--border)',
                    overflow: 'hidden', transition: 'all 0.2s'
                }}>
                    {/* Schedule Header */}
                    <div
                        onClick={() => toggleExpand(schedule.updateScheduleId)}
                        style={{
                            padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem',
                            cursor: 'pointer', userSelect: 'none'
                        }}
                    >
                        {statusIcon(schedule.status)}
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text)' }}>
                                {schedule.scheduleName}
                                {schedule.isRollback && (
                                    <span style={{
                                        marginLeft: '0.5rem', fontSize: '0.65rem', padding: '1px 6px',
                                        background: 'rgba(255,165,0,0.15)', color: 'var(--warning)',
                                        borderRadius: '4px', fontWeight: 500
                                    }}>ROLLBACK</span>
                                )}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                                {schedule.packageVersion} • {schedule.totalTargetCount} MCs • {new Date(schedule.createdDateUtc).toLocaleString()}
                            </div>
                        </div>
                        <span style={{
                            fontSize: '0.7rem', padding: '2px 8px', borderRadius: '4px', fontWeight: 600,
                            background: `${deploymentStatusColor(schedule.status)}15`,
                            color: deploymentStatusColor(schedule.status)
                        }}>
                            {schedule.status}
                        </span>
                        {canRollback(schedule.status) && (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleRollback(schedule.updateScheduleId); }}
                                title="Rollback this deployment"
                                style={{
                                    background: 'rgba(255,165,0,0.1)', border: '1px solid var(--warning)',
                                    borderRadius: '6px', padding: '4px 10px', cursor: 'pointer',
                                    color: 'var(--warning)', fontSize: '0.7rem', fontWeight: 600,
                                    display: 'flex', alignItems: 'center', gap: '4px'
                                }}
                            >
                                <Undo2 size={12} /> Rollback
                            </button>
                        )}
                        {expandedId === schedule.updateScheduleId ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>

                    {/* Halt Warning Banner */}
                    {schedule.status === 'Halted' && schedule.haltReason && (
                        <div style={{
                            padding: '0.5rem 1rem', background: 'rgba(255,165,0,0.08)',
                            borderTop: '1px solid rgba(255,165,0,0.2)',
                            color: 'var(--warning)', fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}>
                            <AlertTriangle size={14} />
                            <span><strong>Halted:</strong> {schedule.haltReason}</span>
                        </div>
                    )}

                    {/* Expanded: Per-MC Deployment Details */}
                    {expandedId === schedule.updateScheduleId && detail && (
                        <div style={{ borderTop: '1px solid var(--border)', padding: '0.5rem 1rem' }}>
                            {detail.deployments
                                .sort((a, b) => (a.executionOrder ?? 0) - (b.executionOrder ?? 0))
                                .map(dep => (
                                    <DeploymentRow key={dep.updateDeploymentId} deployment={dep} />
                                ))}
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
}

/** Single MC deployment row within the expanded schedule detail */
function DeploymentRow({ deployment }: { deployment: UpdateDeployment }) {
    const statusEmoji: Record<string, string> = {
        Completed: '✅', Failed: '❌', Blocked: '🚫', Queued: '⏸',
        Dispatched: '⏳', Downloading: '⏳', Installing: '⏳', Skipped: '⏭', Cancelled: '🚫'
    };

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.4rem 0', borderBottom: '1px solid var(--border)',
            fontSize: '0.78rem', opacity: deployment.status === 'Blocked' ? 0.5 : 1
        }}>
            <span style={{ width: '1.5rem', textAlign: 'center' }}>
                {statusEmoji[deployment.status] ?? '⏸'}
            </span>
            <span style={{ width: '5rem', fontWeight: 600, color: 'var(--text)' }}>
                MC #{deployment.mcNumber ?? deployment.mcId}
            </span>
            <span style={{ flex: 1, color: 'var(--text-dim)' }}>
                {deployment.status}
                {deployment.errorMessage && (
                    <span style={{ color: 'var(--error)', marginLeft: '0.5rem' }}>
                        — {deployment.errorMessage}
                    </span>
                )}
            </span>
            {deployment.reportedAgentVersion && (
                <span style={{ fontSize: '0.65rem', color: 'var(--text-dim)' }}>
                    v{deployment.reportedAgentVersion}
                </span>
            )}
        </div>
    );
}
