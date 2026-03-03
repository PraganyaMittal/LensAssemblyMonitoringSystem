import { useState, useEffect, useRef } from 'react';
import { Rocket, XCircle, Clock, CheckCircle, AlertTriangle, ChevronRight, RefreshCw, Filter } from 'lucide-react';
import { updateApi } from '../../services/updateApi';
import type { UpdateSchedule } from '../../types/updateTypes';
import { Toast } from '../../components/Toast';
import { ConfirmModal } from '../../components/ConfirmModal';

/**
 * List of deployment schedules with status badges, progress, and actions.
 */
export default function ScheduleList() {
    const [schedules, setSchedules] = useState<UpdateSchedule[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('');
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [confirmModal, setConfirmModal] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
    const toastTimer = useRef<any>(null);

    const showToast = (msg: string, type: 'success' | 'error' | 'info' = 'success') => {
        if (toastTimer.current) clearTimeout(toastTimer.current);
        setToast({ msg, type });
        toastTimer.current = setTimeout(() => setToast(null), 4000);
    };

    const loadSchedules = async () => {
        setLoading(true);
        try {
            const res = await updateApi.getSchedules(statusFilter || undefined);
            setSchedules(res.schedules);
        } catch (err: any) {
            showToast(err.message || 'Failed to load schedules', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadSchedules(); }, [statusFilter]);

    const handleCancel = (schedule: UpdateSchedule) => {
        setConfirmModal({
            title: 'Cancel Deployment',
            message: `Cancel "${schedule.scheduleName}"? Queued MCs will not receive the update.`,
            onConfirm: async () => {
                try {
                    const result = await updateApi.cancelSchedule(schedule.updateScheduleId);
                    showToast(result.message || 'Schedule cancelled', 'success');
                    loadSchedules();
                } catch (err: any) {
                    showToast(err.message || 'Cancel failed', 'error');
                }
            }
        });
    };

    const statusConfig: Record<string, { color: string; bg: string; icon: JSX.Element }> = {
        'Pending': { color: '#eab308', bg: 'rgba(234,179,8,0.15)', icon: <Clock size={12} /> },
        'Dispatching': { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', icon: <RefreshCw size={12} /> },
        'InProgress': { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', icon: <RefreshCw size={12} /> },
        'Completed': { color: '#22c55e', bg: 'rgba(34,197,94,0.15)', icon: <CheckCircle size={12} /> },
        'PartiallyCompleted': { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: <AlertTriangle size={12} /> },
        'Cancelled': { color: '#6b7280', bg: 'rgba(107,114,128,0.15)', icon: <XCircle size={12} /> },
        'Failed': { color: '#ef4444', bg: 'rgba(239,68,68,0.15)', icon: <AlertTriangle size={12} /> },
    };

    const formatDate = (d?: string) => {
        if (!d) return '—';
        return new Date(d).toLocaleString(undefined, {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    };

    return (
        <>
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ margin: 0, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Rocket size={18} color="var(--accent)" /> Deployments
                    </h3>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <Filter size={14} color="var(--text-dim)" />
                        <select
                            value={statusFilter}
                            onChange={e => setStatusFilter(e.target.value)}
                            style={{
                                padding: '0.35rem 0.5rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border)',
                                background: 'var(--card-bg)',
                                color: 'var(--text)',
                                fontSize: '0.8rem'
                            }}
                        >
                            <option value="">All Status</option>
                            <option value="Pending">Pending</option>
                            <option value="InProgress">In Progress</option>
                            <option value="Completed">Completed</option>
                            <option value="Cancelled">Cancelled</option>
                            <option value="Failed">Failed</option>
                        </select>
                        <button
                            onClick={loadSchedules}
                            className="btn btn-secondary btn-icon"
                            style={{ padding: '0.35rem' }}
                            title="Refresh"
                        >
                            <RefreshCw size={14} />
                        </button>
                    </div>
                </div>

                {/* Schedule Cards */}
                {loading ? (
                    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                        Loading deployments...
                    </div>
                ) : schedules.length === 0 ? (
                    <div style={{
                        padding: '3rem', textAlign: 'center', color: 'var(--text-dim)',
                        background: 'var(--card-bg)', borderRadius: '12px',
                        border: '1px solid var(--border)'
                    }}>
                        <Rocket size={40} style={{ opacity: 0.3, marginBottom: '0.5rem' }} />
                        <p>No deployments yet</p>
                        <p style={{ fontSize: '0.8rem' }}>Go to Packages tab and click Deploy on a package</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {schedules.map(s => {
                            const cfg = statusConfig[s.status] || statusConfig['Pending'];
                            const completed = s.completedCount || 0;
                            const failed = s.failedCount || 0;
                            const inProgress = s.inProgressCount || 0;
                            const queued = s.queuedCount || 0;
                            const total = s.totalTargetCount;
                            const progressPct = total > 0 ? ((completed + failed) / total) * 100 : 0;
                            const canCancel = s.status === 'Pending' || s.status === 'InProgress' || s.status === 'Dispatching';

                            return (
                                <div key={s.updateScheduleId} style={{
                                    padding: '0.75rem 1rem',
                                    background: 'var(--card-bg)',
                                    borderRadius: '10px',
                                    border: '1px solid var(--border)',
                                    display: 'flex', alignItems: 'center', gap: '1rem',
                                    transition: 'border-color 0.2s',
                                }}>
                                    {/* Status Badge */}
                                    <span style={{
                                        padding: '3px 8px', borderRadius: '4px',
                                        fontSize: '0.7rem', fontWeight: 600,
                                        background: cfg.bg, color: cfg.color,
                                        display: 'flex', alignItems: 'center', gap: '4px',
                                        whiteSpace: 'nowrap', flexShrink: 0,
                                    }}>
                                        {cfg.icon} {s.status}
                                    </span>

                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: '2px' }}>
                                            {s.scheduleName}
                                        </div>
                                        <div style={{
                                            display: 'flex', gap: '0.75rem', fontSize: '0.7rem',
                                            color: 'var(--text-dim)', flexWrap: 'wrap'
                                        }}>
                                            <span style={{
                                                padding: '1px 6px', borderRadius: '3px',
                                                background: s.packageType === 'LAI' ? 'rgba(59,130,246,0.15)' : 'rgba(168,85,247,0.15)',
                                                color: s.packageType === 'LAI' ? '#60a5fa' : '#c084fc'
                                            }}>
                                                {s.packageType}
                                            </span>
                                            <span>v{s.packageVersion}</span>
                                            <span>{s.totalTargetCount} MCs</span>
                                            <span>{formatDate(s.createdDateUtc)}</span>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div style={{ width: '120px', flexShrink: 0 }}>
                                        <div style={{
                                            height: '6px', borderRadius: '3px',
                                            background: 'var(--border)',
                                            overflow: 'hidden'
                                        }}>
                                            <div style={{
                                                height: '100%', borderRadius: '3px',
                                                width: `${progressPct}%`,
                                                background: failed > 0
                                                    ? 'linear-gradient(90deg, #22c55e, #ef4444)'
                                                    : '#22c55e',
                                                transition: 'width 0.3s ease'
                                            }} />
                                        </div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '2px', textAlign: 'center' }}>
                                            {completed}✓ {failed > 0 && `${failed}✗ `}{inProgress > 0 && `${inProgress}⟳ `}{queued > 0 && `${queued}⏳`}
                                            {' / '}{total}
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                                        {canCancel && (
                                            <button
                                                onClick={() => handleCancel(s)}
                                                className="btn btn-danger btn-icon"
                                                style={{ padding: '0.3rem', fontSize: '0.75rem' }}
                                                title="Cancel"
                                            >
                                                <XCircle size={14} />
                                            </button>
                                        )}
                                        <button
                                            className="btn btn-secondary btn-icon"
                                            style={{ padding: '0.3rem' }}
                                            title="View Details"
                                        >
                                            <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Confirm Modal */}
            {confirmModal && (
                <ConfirmModal
                    title={confirmModal.title}
                    message={confirmModal.message}
                    onConfirm={() => { confirmModal.onConfirm(); setConfirmModal(null); }}
                    onCancel={() => setConfirmModal(null)}
                />
            )}
        </>
    );
}
