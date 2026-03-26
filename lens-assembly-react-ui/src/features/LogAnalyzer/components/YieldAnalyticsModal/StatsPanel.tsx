
import { memo } from 'react';

export interface YieldStats {
    current: number;
    average: number;
    min: number;
    max: number;
    stdDev: number;
}

export interface StatsPanelProps {
    stats: YieldStats;
}

export const StatsPanel = memo(function StatsPanel({ stats }: StatsPanelProps) {
    const getColor = (value: number) => {
        if (value >= 95) return '#22c55e';
        if (value >= 85) return '#f59e0b';
        return '#ef4444';
    };

    const StatItem = ({ label, value, isPercentage = true }: { label: string; value: number; isPercentage?: boolean }) => (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 0',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
            <span style={{
                fontSize: '0.75rem',
                color: 'var(--text-dim, #94a3b8)',
                textTransform: 'uppercase',
                letterSpacing: '0.03em',
            }}>
                {label}
            </span>
            <span style={{
                fontSize: '0.9rem',
                fontWeight: 600,
                color: isPercentage ? getColor(value) : 'var(--text-main, #fff)',
            }}>
                {value.toFixed(1)}{isPercentage ? '%' : ''}
            </span>
        </div>
    );

    return (
        <div style={{
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 8,
            padding: '12px 16px',
            minWidth: 160,
        }}>
            <StatItem label="Current" value={stats.current} />
            <StatItem label="Average" value={stats.average} />
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '6px 0',
                borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
                <span style={{
                    fontSize: '0.75rem',
                    color: 'var(--text-dim, #94a3b8)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.03em',
                }}>
                    Min / Max
                </span>
                <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                    <span style={{ color: getColor(stats.min) }}>{stats.min.toFixed(1)}%</span>
                    <span style={{ color: 'var(--text-dim)', margin: '0 4px' }}>/</span>
                    <span style={{ color: getColor(stats.max) }}>{stats.max.toFixed(1)}%</span>
                </span>
            </div>
            <StatItem label="Std Dev" value={stats.stdDev} isPercentage={false} />
        </div>
    );
});

export default StatsPanel;
