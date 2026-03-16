import { useState, useEffect } from 'react';
import { Rocket, X, AlertCircle, CheckSquare, Square, Wifi, WifiOff } from 'lucide-react';
import { updateApi } from '../../services/updateApi';
import type { UpdatePackage, MCTarget, CreateScheduleRequest } from '../../types/updateTypes';

interface DeployModalProps {
    pkg: UpdatePackage;
    onClose: () => void;
    onDeployed: () => void;
    showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function DeployModal({ pkg, onClose, onDeployed, showToast }: DeployModalProps) {
    const [targets, setTargets] = useState<MCTarget[]>([]);
    const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        loadTargets();
    }, []);

    const loadTargets = async () => {
        try {
            const data = await updateApi.getAvailableTargets();
            setTargets(data);
        } catch (err) {
            console.error('Failed to load targets:', err);
        } finally {
            setLoading(false);
        }
    };

    const lineGroups = targets.reduce<Record<number, MCTarget[]>>((acc, mc) => {
        if (!acc[mc.lineNumber]) acc[mc.lineNumber] = [];
        acc[mc.lineNumber].push(mc);
        return acc;
    }, {});

    const toggleLine = (line: number) => {
        setSelectedLines(prev => {
            const next = new Set(prev);
            next.has(line) ? next.delete(line) : next.add(line);
            return next;
        });
    };

    const matchedTargets = targets.filter(t => selectedLines.has(t.lineNumber));
    const targetTotal = matchedTargets.length;
    const targetOnline = matchedTargets.filter(m => m.isOnline).length;
    const offlineCount = targetTotal - targetOnline;

    const handleSubmit = async () => {
        if (targetTotal === 0) {
            showToast('No lines selected', 'error');
            return;
        }

        setSubmitting(true);
        try {
            const lines = [...selectedLines];
            const lineLabel = lines.length === 1 ? `Line ${lines[0]}` : `${lines.length} Lines`;

            const request: CreateScheduleRequest = {
                packageId: pkg.updatePackageId,
                scheduleName: `${pkg.packageType} v${pkg.version} → ${lineLabel}`,
                targetType: 'ByLine',
                targetFilter: JSON.stringify({ lineNumbers: lines }),
                scheduleType: 'Immediate',
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

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content animate-scale-in" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
                {}
                <div className="modal-header" style={{ padding: '1rem 1.25rem' }}>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', fontWeight: 600 }}>
                        <Rocket size={18} color="var(--primary)" /> Deploy Package
                    </h3>
                    <button onClick={onClose} className="btn btn-secondary btn-icon" style={{ padding: '4px', width: '28px', height: '28px' }}>
                        <X size={16} />
                    </button>
                </div>

                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {}
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.85rem 1rem',
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                    marginBottom: '1.25rem',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <span style={{
                            padding: '3px 10px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600,
                            background: pkg.packageType === 'Bundle' ? 'rgba(99,102,241,0.15)' : 'rgba(59,130,246,0.15)',
                            color: pkg.packageType === 'Bundle' ? '#818cf8' : '#60a5fa'
                        }}>
                            {pkg.packageType}
                        </span>
                        <span style={{ color: 'var(--text-main)', fontWeight: 600, fontSize: '0.9rem' }}>
                            v{pkg.version}
                        </span>
                    </div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', fontWeight: 500 }}>
                        {formatSize(pkg.fileSize)}
                    </span>
                </div>

                {}
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{
                        fontSize: '0.75rem', color: 'var(--text-dim)', display: 'block',
                        marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase',
                        letterSpacing: '0.03em'
                    }}>
                        Select Target Lines
                    </label>

                    {loading ? (
                        <div style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center' }}>
                            Loading lines...
                        </div>
                    ) : Object.keys(lineGroups).length === 0 ? (
                        <div style={{ padding: '1rem', color: 'var(--text-dim)', fontSize: '0.8rem', textAlign: 'center' }}>
                            No machines available
                        </div>
                    ) : (
                        <div style={{
                            maxHeight: '220px',
                            overflowY: 'auto',
                            border: '1px solid var(--border)',
                            borderRadius: '8px',
                        }}>
                            {Object.entries(lineGroups).map(([line, mcs], idx) => {
                                const lineNum = Number(line);
                                const onlineCount = mcs.filter(m => m.isOnline).length;
                                const offlineLine = mcs.length - onlineCount;
                                const isSelected = selectedLines.has(lineNum);

                                return (
                                    <div
                                        key={lineNum}
                                        onClick={() => toggleLine(lineNum)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                                            padding: '0.45rem 0.65rem', cursor: 'pointer',
                                            borderBottom: idx < Object.keys(lineGroups).length - 1 ? '1px solid var(--border)' : 'none',
                                            background: isSelected ? 'rgba(34,197,94,0.06)' : 'transparent',
                                            transition: 'background 0.15s'
                                        }}
                                    >
                                        {isSelected
                                            ? <CheckSquare size={15} color="var(--primary)" />
                                            : <Square size={15} color="var(--text-dim)" />
                                        }
                                        <span style={{ fontWeight: 600, fontSize: '0.82rem', flex: 1 }}>
                                            Line {lineNum}
                                        </span>
                                        <span style={{
                                            fontSize: '0.68rem', color: 'var(--text-dim)',
                                            display: 'flex', alignItems: 'center', gap: '0.4rem'
                                        }}>
                                            <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                <Wifi size={10} color="#22c55e" /> {onlineCount}
                                            </span>
                                            {offlineLine > 0 && (
                                                <span style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                                                    <WifiOff size={10} color="#6b7280" /> {offlineLine}
                                                </span>
                                            )}
                                            <span style={{ color: 'var(--text-dim)' }}>
                                                ({mcs.length} MCs)
                                            </span>
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {}
                    {targetTotal > 0 && (
                        <div style={{
                            marginTop: '0.4rem',
                            padding: '0.4rem 0.65rem',
                            background: 'rgba(34,197,94,0.08)',
                            borderRadius: '6px',
                            fontSize: '0.75rem',
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
                            marginTop: '0.2rem',
                            padding: '0.3rem 0.65rem',
                            background: 'rgba(234,179,8,0.08)',
                            borderRadius: '6px',
                            fontSize: '0.7rem',
                            color: '#eab308',
                            display: 'flex', alignItems: 'center', gap: '0.3rem'
                        }}>
                            <AlertCircle size={11} />
                            Offline MCs will receive the update when they reconnect
                        </div>
                    )}
                </div>

                {}
                <button
                    onClick={handleSubmit}
                    disabled={submitting || targetTotal === 0}
                    className="btn btn-success"
                    style={{
                        width: '100%',
                        padding: '0.6rem',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
                        opacity: (submitting || targetTotal === 0) ? 0.5 : 1,
                        borderRadius: '8px'
                    }}
                >
                    <Rocket size={16} />
                    {submitting ? 'Deploying...' : `Deploy to ${targetTotal} MCs Now`}
                </button>
                </div>
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
