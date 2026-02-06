/**
 * MachineDetailView - No-Scroll Dashboard with AdvancedSpeedometer Hero
 * 
 * Holy Grail 3-column layout:
 * - Left: Stats Panel (20-25%)
 * - Center: AdvancedSpeedometer Hero (50-60%)
 * - Right: Actions Panel (20-25%)
 * 
 * Constraints:
 * - Zero scrolling (overflow: hidden)
 * - Responsive panel compression
 */
import { memo, useState, useCallback } from 'react';
import { RefreshCw, Download, Settings, AlertTriangle, TrendingUp, Activity, Package, Zap } from 'lucide-react';
import { AdvancedSpeedometer } from '../AdvancedSpeedometer';
import './MachineDetailView.css';

// =============================================================================
// TYPES
// =============================================================================

export interface MachineStats {
    yield: number;
    targetYield?: number;
    errorRate: number;
    processedVolume: number;
    uptime: number;
    cycleTime?: number;
}

export interface MachineDetailViewProps {
    /** Machine ID */
    machineId: number;
    /** Machine number for display */
    machineNumber: number;
    /** Line number this machine belongs to */
    lineNumber: number;
    /** Machine statistics */
    stats: MachineStats;
    /** Line average yield for comparison */
    lineAverageYield?: number;
    /** Is machine currently offline */
    isOffline?: boolean;
    /** Is data loading */
    isLoading?: boolean;
    /** View mode */
    mode?: 'line' | 'machine';
    /** Callbacks */
    onRefresh?: () => void;
    onExport?: () => void;
    onSettings?: () => void;
}

// =============================================================================
// STAT CARD COMPONENT
// =============================================================================

interface StatCardProps {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    unit?: string;
    trend?: 'up' | 'down' | 'neutral';
    color?: 'success' | 'warning' | 'danger' | 'primary';
}

const StatCard = memo(function StatCard({
    icon,
    label,
    value,
    unit,
    color = 'primary',
}: StatCardProps) {
    const colorClasses = {
        success: 'stat-card--success',
        warning: 'stat-card--warning',
        danger: 'stat-card--danger',
        primary: 'stat-card--primary',
    };

    return (
        <div className={`stat-card ${colorClasses[color]}`}>
            <div className="stat-card__icon">{icon}</div>
            <div className="stat-card__content">
                <span className="stat-card__label">{label}</span>
                <span className="stat-card__value">
                    {value}
                    {unit && <span className="stat-card__unit">{unit}</span>}
                </span>
            </div>
        </div>
    );
});

// =============================================================================
// ACTION BUTTON COMPONENT
// =============================================================================

interface ActionButtonProps {
    icon: React.ReactNode;
    label: string;
    onClick?: () => void;
    variant?: 'primary' | 'secondary';
    disabled?: boolean;
}

const ActionButton = memo(function ActionButton({
    icon,
    label,
    onClick,
    variant = 'secondary',
    disabled = false,
}: ActionButtonProps) {
    return (
        <button
            className={`action-btn action-btn--${variant}`}
            onClick={onClick}
            disabled={disabled}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const MachineDetailView = memo(function MachineDetailView({
    machineNumber,
    lineNumber,
    stats,
    lineAverageYield,
    isOffline = false,
    isLoading = false,
    mode = 'machine',
    onRefresh,
    onExport,
    onSettings,
}: MachineDetailViewProps) {
    const [isRefreshing, setIsRefreshing] = useState(false);

    const handleRefresh = useCallback(async () => {
        if (onRefresh) {
            setIsRefreshing(true);
            await onRefresh();
            setTimeout(() => setIsRefreshing(false), 500);
        }
    }, [onRefresh]);

    // Determine yield color based on value
    const getYieldStatus = (value: number): 'success' | 'warning' | 'danger' => {
        if (value >= 85) return 'success';
        if (value >= 70) return 'warning';
        return 'danger';
    };

    return (
        <div className="machine-detail-view">
            {/* Header Bar */}
            <header className="machine-detail-view__header">
                <div className="machine-detail-view__title">
                    <h1>MC-{machineNumber}</h1>
                    <span className="machine-detail-view__subtitle">Line {lineNumber}</span>
                </div>
                <div className="machine-detail-view__status">
                    {isOffline ? (
                        <span className="status-badge status-badge--offline">
                            <AlertTriangle size={14} />
                            Offline
                        </span>
                    ) : (
                        <span className="status-badge status-badge--online">
                            <Activity size={14} />
                            Online
                        </span>
                    )}
                </div>
            </header>

            {/* Main Content - 3 Column Layout */}
            <main className="machine-detail-view__content">
                {/* Left Panel: Stats */}
                <aside className="machine-detail-view__panel machine-detail-view__panel--left">
                    <h2 className="panel-title">Statistics</h2>
                    <div className="stats-grid">
                        <StatCard
                            icon={<TrendingUp size={18} />}
                            label="Yield Rate"
                            value={stats.yield.toFixed(1)}
                            unit="%"
                            color={getYieldStatus(stats.yield)}
                        />
                        <StatCard
                            icon={<AlertTriangle size={18} />}
                            label="Error Rate"
                            value={stats.errorRate.toFixed(2)}
                            unit="%"
                            color={stats.errorRate > 5 ? 'danger' : stats.errorRate > 2 ? 'warning' : 'success'}
                        />
                        <StatCard
                            icon={<Package size={18} />}
                            label="Processed"
                            value={stats.processedVolume.toLocaleString()}
                            unit="units"
                            color="primary"
                        />
                        <StatCard
                            icon={<Zap size={18} />}
                            label="Uptime"
                            value={stats.uptime.toFixed(1)}
                            unit="%"
                            color={stats.uptime >= 95 ? 'success' : stats.uptime >= 80 ? 'warning' : 'danger'}
                        />
                    </div>
                </aside>

                {/* Center: Speedometer Hero */}
                <div className="machine-detail-view__hero">
                    <AdvancedSpeedometer
                        primaryValue={stats.yield}
                        primaryLabel="Yield"
                        secondaryValue={lineAverageYield}
                        secondaryLabel="Line Avg"
                        mode={mode}
                        size={400}
                        isOffline={isOffline}
                        isLoading={isLoading}
                    />
                </div>

                {/* Right Panel: Actions */}
                <aside className="machine-detail-view__panel machine-detail-view__panel--right">
                    <h2 className="panel-title">Actions</h2>
                    <div className="actions-grid">
                        <ActionButton
                            icon={<RefreshCw size={16} className={isRefreshing ? 'spin' : ''} />}
                            label="Refresh Data"
                            onClick={handleRefresh}
                            variant="primary"
                        />
                        <ActionButton
                            icon={<Download size={16} />}
                            label="Export Report"
                            onClick={onExport}
                        />
                        <ActionButton
                            icon={<Settings size={16} />}
                            label="Settings"
                            onClick={onSettings}
                        />
                    </div>

                    {/* Quick Info */}
                    <div className="quick-info">
                        <h3 className="quick-info__title">Quick Info</h3>
                        {stats.cycleTime && (
                            <div className="quick-info__item">
                                <span>Cycle Time</span>
                                <span>{stats.cycleTime.toFixed(1)}s</span>
                            </div>
                        )}
                        {stats.targetYield && (
                            <div className="quick-info__item">
                                <span>Target Yield</span>
                                <span>{stats.targetYield.toFixed(1)}%</span>
                            </div>
                        )}
                    </div>
                </aside>
            </main>
        </div>
    );
});

export default MachineDetailView;
