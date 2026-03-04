import { useState, useEffect, useRef } from 'react';
import { BarChart3, Package, Rocket, CheckCircle, AlertTriangle, Activity, Clock } from 'lucide-react';
import { updateApi } from '../../services/updateApi';

interface DashboardData {
    totalPackages: number;
    totalSchedules: number;
    activeDeployments: number;
    completedDeployments: number;
    failedDeployments: number;
    successRate: number;
    recentSchedules: {
        updateScheduleId: number;
        scheduleName: string;
        status: string;
        totalTargetCount: number;
        createdDateUtc: string;
        packageName: string;
        packageType: string;
        packageVersion: string;
    }[];
}

export default function DashboardTab() {
    const [data, setData] = useState<DashboardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const intervalRef = useRef<any>(null);

    const loadDashboard = async () => {
        try {
            const result = await updateApi.getDashboard();
            setData(result);
            setError('');
        } catch (err: any) {
            setError(err.message || 'Failed to load dashboard');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDashboard();
        intervalRef.current = setInterval(loadDashboard, 15000); // Auto-refresh every 15s
        return () => clearInterval(intervalRef.current);
    }, []);

    if (loading) {
        return <div style={{ padding: '2rem', color: 'var(--text-dim)' }}>Loading dashboard...</div>;
    }

    if (error) {
        return <div style={{ padding: '2rem', color: '#ef4444' }}>{error}</div>;
    }

    if (!data) return null;

    const statCards = [
        {
            label: 'Total Packages',
            value: data.totalPackages,
            icon: <Package size={22} />,
            color: '#3b82f6',
            bg: 'rgba(59,130,246,0.12)'
        },
        {
            label: 'Active Deployments',
            value: data.activeDeployments,
            icon: <Activity size={22} />,
            color: '#f59e0b',
            bg: 'rgba(245,158,11,0.12)'
        },
        {
            label: 'Completed',
            value: data.completedDeployments,
            icon: <CheckCircle size={22} />,
            color: '#22c55e',
            bg: 'rgba(34,197,94,0.12)'
        },
        {
            label: 'Failed',
            value: data.failedDeployments,
            icon: <AlertTriangle size={22} />,
            color: '#ef4444',
            bg: 'rgba(239,68,68,0.12)'
        },
        {
            label: 'Success Rate',
            value: `${data.successRate}%`,
            icon: <BarChart3 size={22} />,
            color: data.successRate >= 90 ? '#22c55e' : data.successRate >= 70 ? '#f59e0b' : '#ef4444',
            bg: data.successRate >= 90 ? 'rgba(34,197,94,0.12)' : data.successRate >= 70 ? 'rgba(245,158,11,0.12)' : 'rgba(239,68,68,0.12)'
        },
        {
            label: 'Total Schedules',
            value: data.totalSchedules,
            icon: <Rocket size={22} />,
            color: '#a855f7',
            bg: 'rgba(168,85,247,0.12)'
        }
    ];

    const statusColor: Record<string, string> = {
        'Pending': '#eab308',
        'InProgress': '#3b82f6',
        'Completed': '#22c55e',
        'PartiallyCompleted': '#f59e0b',
        'Failed': '#ef4444',
        'Cancelled': '#6b7280',
    };

    const formatDate = (d: string) =>
        new Date(d).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <BarChart3 size={20} color="var(--primary)" />
                <h2 style={{ fontSize: '1.2rem', margin: 0, fontWeight: 600 }}>Update Dashboard</h2>
            </div>

            {/* Stat Cards Grid */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                gap: '0.75rem'
            }}>
                {statCards.map((card, i) => (
                    <div key={i} style={{
                        padding: '1rem',
                        background: 'var(--card-bg)',
                        borderRadius: '12px',
                        border: '1px solid var(--border)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.75rem',
                        transition: 'border-color 0.2s',
                    }}>
                        <div style={{
                            width: '44px', height: '44px',
                            borderRadius: '10px',
                            background: card.bg,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            color: card.color,
                            flexShrink: 0
                        }}>
                            {card.icon}
                        </div>
                        <div>
                            <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>
                                {card.value}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', fontWeight: 500 }}>
                                {card.label}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Recent Schedules */}
            <div className="mc-card">
                <div className="mc-card-header">
                    <h3 style={{ fontSize: '0.95rem', margin: 0, fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Clock size={16} /> Recent Deployments
                    </h3>
                </div>
                <div className="mc-card-body" style={{ padding: 0 }}>
                    {data.recentSchedules.length === 0 ? (
                        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                            No deployments yet
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {data.recentSchedules.map((s, i) => (
                                <div key={s.updateScheduleId} style={{
                                    padding: '0.65rem 1rem',
                                    display: 'flex', alignItems: 'center', gap: '0.75rem',
                                    borderBottom: i < data.recentSchedules.length - 1 ? '1px solid var(--border)' : 'none',
                                }}>
                                    {/* Status dot */}
                                    <span style={{
                                        width: '8px', height: '8px', borderRadius: '50%',
                                        background: statusColor[s.status] || '#6b7280',
                                        flexShrink: 0
                                    }} />
                                    {/* Info */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{
                                            fontSize: '0.82rem', fontWeight: 600,
                                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                                        }}>
                                            {s.scheduleName}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                            {s.packageType} v{s.packageVersion} · {s.totalTargetCount} MCs
                                        </div>
                                    </div>
                                    {/* Status + Date */}
                                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                        <span style={{
                                            fontSize: '0.65rem', fontWeight: 600,
                                            padding: '2px 6px', borderRadius: '4px',
                                            color: statusColor[s.status] || '#6b7280',
                                            background: `${statusColor[s.status] || '#6b7280'}20`,
                                        }}>
                                            {s.status}
                                        </span>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: '2px' }}>
                                            {formatDate(s.createdDateUtc)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
