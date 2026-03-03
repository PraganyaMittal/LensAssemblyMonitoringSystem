import { useState } from 'react';
import { Rocket, Calendar, Zap, X, AlertCircle } from 'lucide-react';
import { updateApi } from '../../services/updateApi';
import MCTargetSelector from './MCTargetSelector';
import type { UpdatePackage, TargetType, CreateScheduleRequest } from '../../types/updateTypes';

interface DeployModalProps {
    pkg: UpdatePackage;
    onClose: () => void;
    onDeployed: () => void;
    showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

/**
 * Modal for creating a deployment schedule from a selected package.
 * Shows package info, target selector, timing options, and creates the schedule.
 */
export default function DeployModal({ pkg, onClose, onDeployed, showToast }: DeployModalProps) {
    const [targetType, setTargetType] = useState<TargetType>('All');
    const [targetFilter, setTargetFilter] = useState<string | undefined>();
    const [targetTotal, setTargetTotal] = useState(0);
    const [targetOnline, setTargetOnline] = useState(0);
    const [scheduleType, setScheduleType] = useState<'Immediate' | 'Scheduled'>('Immediate');
    const [scheduledTime, setScheduledTime] = useState('');
    const [scheduleName, setScheduleName] = useState(
        `${pkg.packageName} v${pkg.version} → All MCs`
    );
    const [submitting, setSubmitting] = useState(false);

    // Update schedule name when target type changes
    const handleTargetTypeChange = (type: TargetType) => {
        setTargetType(type);
        const targetLabel = type === 'All' ? 'All MCs' :
            type === 'ByVersion' ? 'By Version' :
                type === 'ByLine' ? 'By Line' : 'Selected MCs';
        setScheduleName(`${pkg.packageName} v${pkg.version} → ${targetLabel}`);
    };

    const handleSubmit = async () => {
        if (targetTotal === 0) {
            showToast('No targets selected', 'error');
            return;
        }

        if (scheduleType === 'Scheduled' && !scheduledTime) {
            showToast('Please select a scheduled time', 'error');
            return;
        }

        setSubmitting(true);
        try {
            const request: CreateScheduleRequest = {
                packageId: pkg.updatePackageId,
                scheduleName,
                targetType,
                targetFilter,
                scheduleType,
                scheduledTimeUtc: scheduleType === 'Scheduled'
                    ? new Date(scheduledTime).toISOString()
                    : undefined,
            };

            const result = await updateApi.createSchedule(request);
            showToast(
                `Deployment created! ${result.targetCount} MCs targeted.`,
                'success'
            );
            onDeployed();
            onClose();
        } catch (err: any) {
            showToast(err.message || 'Failed to create deployment', 'error');
        } finally {
            setSubmitting(false);
        }
    };

    const offlineCount = targetTotal - targetOnline;

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        }} onClick={onClose}>
            <div
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'var(--card-bg)',
                    border: '1px solid var(--border)',
                    borderRadius: '12px',
                    width: '560px',
                    maxHeight: '85vh',
                    overflowY: 'auto',
                    padding: '1.5rem',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
                }}
            >
                {/* Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
                        <Rocket size={20} color="var(--accent)" /> Deploy Package
                    </h3>
                    <button onClick={onClose} style={{
                        background: 'none', border: 'none', color: 'var(--text-dim)',
                        cursor: 'pointer', padding: '4px'
                    }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Package Info */}
                <div style={{
                    padding: '0.75rem 1rem',
                    background: 'var(--bg-secondary)',
                    borderRadius: '8px',
                    marginBottom: '1.25rem',
                    fontSize: '0.85rem'
                }}>
                    <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                        <span><strong>{pkg.packageName}</strong></span>
                        <span style={{
                            padding: '1px 8px', borderRadius: '4px', fontSize: '0.75rem',
                            background: pkg.packageType === 'LAI' ? 'rgba(59,130,246,0.2)' : 'rgba(168,85,247,0.2)',
                            color: pkg.packageType === 'LAI' ? '#60a5fa' : '#c084fc'
                        }}>
                            {pkg.packageType}
                        </span>
                        <span style={{ color: 'var(--accent)' }}>v{pkg.version}</span>
                        <span style={{ color: 'var(--text-dim)' }}>{formatSize(pkg.fileSize)}</span>
                    </div>
                </div>

                {/* Schedule Name */}
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'block', marginBottom: '4px' }}>
                        Schedule Name
                    </label>
                    <input
                        type="text"
                        value={scheduleName}
                        onChange={e => setScheduleName(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.5rem',
                            borderRadius: '6px',
                            border: '1px solid var(--border)',
                            background: 'var(--card-bg)',
                            color: 'var(--text)',
                            fontSize: '0.85rem',
                            boxSizing: 'border-box'
                        }}
                    />
                </div>

                {/* Target Selection */}
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                        Target MCs
                    </label>
                    <MCTargetSelector
                        targetType={targetType}
                        onTargetTypeChange={handleTargetTypeChange}
                        onFilterChange={setTargetFilter}
                        onTargetCountChange={(total, online) => {
                            setTargetTotal(total);
                            setTargetOnline(online);
                        }}
                    />
                    {/* Target Count Preview */}
                    {targetTotal > 0 && (
                        <div style={{
                            marginTop: '0.5rem',
                            padding: '0.5rem 0.75rem',
                            background: 'rgba(34,197,94,0.1)',
                            borderRadius: '6px',
                            fontSize: '0.8rem',
                            display: 'flex', alignItems: 'center', gap: '0.5rem'
                        }}>
                            <span style={{ color: '#22c55e', fontWeight: 600 }}>
                                {targetTotal} MCs matched
                            </span>
                            <span style={{ color: 'var(--text-dim)' }}>
                                ({targetOnline} online{offlineCount > 0 && `, ${offlineCount} offline`})
                            </span>
                        </div>
                    )}
                    {offlineCount > 0 && (
                        <div style={{
                            marginTop: '0.25rem',
                            padding: '0.4rem 0.75rem',
                            background: 'rgba(234,179,8,0.1)',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
                            color: '#eab308',
                            display: 'flex', alignItems: 'center', gap: '0.4rem'
                        }}>
                            <AlertCircle size={12} />
                            Offline MCs will receive the update when they reconnect
                        </div>
                    )}
                </div>

                {/* Timing */}
                <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                        Timing
                    </label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                            onClick={() => setScheduleType('Immediate')}
                            style={{
                                flex: 1, padding: '0.6rem',
                                borderRadius: '8px',
                                border: scheduleType === 'Immediate' ? '1px solid var(--accent)' : '1px solid var(--border)',
                                background: scheduleType === 'Immediate' ? 'rgba(34,197,94,0.1)' : 'transparent',
                                color: 'var(--text)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                fontSize: '0.85rem'
                            }}
                        >
                            <Zap size={16} color={scheduleType === 'Immediate' ? 'var(--accent)' : 'var(--text-dim)'} />
                            Immediate
                        </button>
                        <button
                            onClick={() => setScheduleType('Scheduled')}
                            style={{
                                flex: 1, padding: '0.6rem',
                                borderRadius: '8px',
                                border: scheduleType === 'Scheduled' ? '1px solid #3b82f6' : '1px solid var(--border)',
                                background: scheduleType === 'Scheduled' ? 'rgba(59,130,246,0.1)' : 'transparent',
                                color: 'var(--text)', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                                fontSize: '0.85rem'
                            }}
                        >
                            <Calendar size={16} color={scheduleType === 'Scheduled' ? '#3b82f6' : 'var(--text-dim)'} />
                            Scheduled
                        </button>
                    </div>

                    {scheduleType === 'Scheduled' && (
                        <input
                            type="datetime-local"
                            value={scheduledTime}
                            onChange={e => setScheduledTime(e.target.value)}
                            min={new Date().toISOString().slice(0, 16)}
                            style={{
                                width: '100%', marginTop: '0.5rem',
                                padding: '0.5rem',
                                borderRadius: '6px',
                                border: '1px solid var(--border)',
                                background: 'var(--card-bg)',
                                color: 'var(--text)',
                                fontSize: '0.85rem',
                                boxSizing: 'border-box'
                            }}
                        />
                    )}
                </div>

                {/* Submit */}
                <button
                    onClick={handleSubmit}
                    disabled={submitting || targetTotal === 0}
                    className="btn btn-success"
                    style={{
                        width: '100%',
                        padding: '0.65rem',
                        fontSize: '0.9rem',
                        fontWeight: 600,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                        opacity: (submitting || targetTotal === 0) ? 0.5 : 1,
                    }}
                >
                    <Rocket size={18} />
                    {submitting ? 'Creating...'
                        : scheduleType === 'Immediate'
                            ? `Deploy to ${targetTotal} MCs Now`
                            : `Schedule for ${targetTotal} MCs`}
                </button>
            </div>
        </div>
    );
}

function formatSize(bytes: number): string {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
}
