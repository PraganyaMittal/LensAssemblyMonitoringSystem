/**
 * YieldAnalyticsModal - Line Yield Analysis
 * 
 * Features:
 * - KPIs: Line Yield, Consistency, Machines
 * - Advanced Trend Chart (Plotly with zoom, pan, modebar)
 * - Best/Worst machine text indicator
 */
import { memo, useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, TrendingUp, Info } from 'lucide-react';
import Plotly from 'plotly.js-dist-min';
import { useLogAnalyzerSettingsSafe } from '../../context';
import { YieldService, type YieldHistoryRecord } from '../../../../services/YieldService';

// =============================================================================
// TYPES
// =============================================================================

export interface MachineYieldData {
    mcId: number;
    mcNumber: number;
    yield: number;
}

export interface YieldAnalyticsModalProps {
    isOpen: boolean;
    onClose: () => void;
    mode: 'machine' | 'line';
    machine?: { mcId: number; mcNumber: number; yield: number };
    lineInfo?: { lineNumber: number; machines: MachineYieldData[] };
    onMachineClick?: (machine: MachineYieldData) => void;
}

// =============================================================================
// STYLES
// =============================================================================

const STYLES = {
    overlay: {
        position: 'fixed' as const,
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
    },
    modal: {
        background: 'var(--bg-card, #1e293b)',
        border: '1px solid var(--border, #334155)',
        borderRadius: 10,
        width: '95%',
        maxWidth: 950,
        height: '85vh',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column' as const,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '6px 12px',
        borderBottom: '1px solid var(--border, #334155)',
        background: 'rgba(0,0,0,0.15)',
        flexShrink: 0,
    },
    content: {
        flex: 1,
        display: 'flex',
        flexDirection: 'column' as const,
        padding: '6px 12px 4px 12px',
        gap: 4,
        overflow: 'hidden',
    },
    closeBtn: {
        background: 'rgba(255,255,255,0.08)',
        border: 'none',
        borderRadius: 4,
        padding: '2px 6px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        fontSize: '0.6rem',
        color: 'var(--text-dim)',
    },
    chartSection: {
        flex: 1,
        background: 'rgba(0,0,0,0.08)',
        borderRadius: 6,
        overflow: 'hidden',
    },
};

// =============================================================================
// LINE KPI CARDS
// =============================================================================

const LineKPIs = memo(function LineKPIs({
    currentYield,
    minMachine,
    maxMachine,
    machineCount
}: {
    currentYield: number;
    minMachine: { mcNumber: number; yield: number } | null;
    maxMachine: { mcNumber: number; yield: number } | null;
    machineCount: number;
}) {
    const getColor = (v: number) => v >= 95 ? '#22c55e' : v >= 85 ? '#f59e0b' : '#ef4444';

    const StatCard = ({ label, value, subtext, color }: { label: string; value: string; subtext?: string; color: string }) => (
        <div style={{
            flex: 1,
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 4,
            padding: '6px 10px',
            textAlign: 'center',
            transition: 'background 0.2s',
        }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', letterSpacing: '0.02em', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color }}>{value}</div>
            {subtext && <div style={{ fontSize: '0.7rem', color: 'var(--text-main)', marginTop: 2, fontWeight: 500 }}>{subtext}</div>}
        </div>
    );

    return (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <StatCard
                label="YIELD"
                value={`${currentYield.toFixed(1)}%`}
                color={getColor(currentYield)}
            />
            <StatCard
                label="⚠️ Needs Attention"
                value={minMachine ? `${minMachine.yield.toFixed(1)}%` : '-'}
                subtext={minMachine ? `MC-${minMachine.mcNumber}` : ''}
                color={minMachine ? getColor(minMachine.yield) : '#64748b'}
            />
            <StatCard
                label="🏆 Best Performance"
                value={maxMachine ? `${maxMachine.yield.toFixed(1)}%` : '-'}
                subtext={maxMachine ? `MC-${maxMachine.mcNumber}` : ''}
                color={maxMachine ? getColor(maxMachine.yield) : '#64748b'}
            />
            <StatCard
                label="MCs"
                value={String(machineCount)}
                color="var(--text-main, #f1f5f9)"
            />
        </div>
    );
});

// =============================================================================
// ADVANCED TREND CHART - Full Plotly Features
// =============================================================================

const AdvancedTrendChart = memo(function AdvancedTrendChart({
    historyData,
    machines,
    lineNumber,
    redThreshold,
    yellowThreshold
}: {
    historyData: Map<number, YieldHistoryRecord[]>;
    machines: MachineYieldData[];
    lineNumber: number;
    redThreshold: number;
    yellowThreshold: number;
}) {
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartRef.current || machines.length === 0) return;

        // Aggregate all machine data by date to get line average
        const dateYieldMap = new Map<string, { total: number; count: number }>();

        machines.forEach(m => {
            const history = historyData.get(m.mcId) || [];
            history.forEach(record => {
                const existing = dateYieldMap.get(record.date) || { total: 0, count: 0 };
                dateYieldMap.set(record.date, {
                    total: existing.total + record.yieldPercentage,
                    count: existing.count + 1,
                });
            });
        });

        const dates = Array.from(dateYieldMap.keys()).sort();
        const avgYields = dates.map(d => {
            const data = dateYieldMap.get(d)!;
            return data.total / data.count;
        });

        if (dates.length === 0) {
            chartRef.current.innerHTML = '<div style="text-align:center;color:#64748b;padding:50px;font-size:0.8rem;">No historical data available</div>';
            return;
        }

        // Main trend line
        const mainTrace = {
            type: 'scatter',
            mode: 'lines+markers',
            name: 'Line Average',
            x: dates,
            y: avgYields,
            line: {
                color: '#3b82f6',
                width: 3,
                shape: 'linear',
            },
            marker: {
                size: 7,
                color: avgYields.map(y => y >= yellowThreshold ? '#22c55e' : y >= redThreshold ? '#f59e0b' : '#ef4444'),
                line: { color: '#1e293b', width: 1 }
            },
            fill: 'tozeroy',
            fillcolor: 'rgba(59, 130, 246, 0.1)',
            hovertemplate: 'Yield: <b>%{y:.1f}%</b><br>Date: %{x|%b %d, %Y}<extra></extra>',
        };

        // Target line at yellowThreshold
        const targetTrace = {
            type: 'scatter',
            mode: 'lines',
            name: `Target (${yellowThreshold}%)`,
            x: [dates[0], dates[dates.length - 1]],
            y: [yellowThreshold, yellowThreshold],
            line: {
                color: '#22c55e',
                width: 1.5,
                dash: 'dot',
            },
            hoverinfo: 'skip',
        };



        // Critical line at redThreshold
        const criticalTrace = {
            type: 'scatter',
            mode: 'lines',
            name: `Critical (${redThreshold}%)`,
            x: [dates[0], dates[dates.length - 1]],
            y: [redThreshold, redThreshold],
            line: {
                color: '#ef4444',
                width: 1.5,
                dash: 'dot',
            },
            hoverinfo: 'skip',
        };

        const layout = {
            autosize: true,
            margin: { l: 40, r: 10, t: 20, b: 5 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: '#94a3b8', size: 10 },
            xaxis: {
                gridcolor: 'rgba(255,255,255,0.05)',
                type: 'date',
                tickformat: '%b %d',
                tickangle: -30,
                showgrid: true,
                zeroline: false,
                rangeslider: {
                    visible: true,
                    thickness: 0.04,
                    bgcolor: 'rgba(100, 116, 139, 0.2)',
                    bordercolor: 'rgba(100, 116, 139, 0.3)',
                    borderwidth: 1,
                },
            },
            yaxis: {
                gridcolor: 'rgba(255,255,255,0.05)',
                range: [Math.min(...avgYields) - 5, 100],
                ticksuffix: '%',
                showgrid: true,
                zeroline: false,
                fixedrange: false,
            },
            hovermode: 'x unified',
            legend: {
                orientation: 'h',
                y: 1.02,
                x: 0,
                xanchor: 'left',
                font: { size: 10 },
                bgcolor: 'transparent',
            },
            shapes: [
                // Warning zone (85-95%)
                {
                    type: 'rect',
                    xref: 'paper',
                    yref: 'y',
                    x0: 0,
                    x1: 1,
                    y0: 85,
                    y1: 95,
                    fillcolor: 'rgba(245, 158, 11, 0.05)',
                    line: { width: 0 },
                },
                // Danger zone (< 85%)
                {
                    type: 'rect',
                    xref: 'paper',
                    yref: 'y',
                    x0: 0,
                    x1: 1,
                    y0: 0,
                    y1: 85,
                    fillcolor: 'rgba(239, 68, 68, 0.05)',
                    line: { width: 0 },
                },
            ],
        };

        const config = {
            displayModeBar: true,
            modeBarButtonsToInclude: [
                'zoom2d', 'pan2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d', 'resetScale2d',
                'hoverClosestCartesian', 'hoverCompareCartesian',
                'toImage'
            ],
            modeBarButtonsToRemove: ['lasso2d', 'select2d'],
            displaylogo: false,
            responsive: true,
            toImageButtonOptions: {
                format: 'png',
                filename: `line_${lineNumber}_yield_trend`,
                height: 600,
                width: 1200,
                scale: 2
            }
        };

        Plotly.newPlot(chartRef.current, [mainTrace, targetTrace, criticalTrace], layout, config);

        return () => { if (chartRef.current) Plotly.purge(chartRef.current); };
    }, [historyData, machines, lineNumber]);

    return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
});

// =============================================================================
// MACHINE KPIs
// =============================================================================

const TrendInfoTooltip = memo(function TrendInfoTooltip() {
    const [show, setShow] = useState(false);
    return (
        <div style={{ position: 'relative', display: 'inline-flex' }}>
            <Info
                size={12}
                style={{ cursor: 'help', color: 'var(--text-dim, #64748b)', opacity: 0.7 }}
                onMouseEnter={() => setShow(true)}
                onMouseLeave={() => setShow(false)}
            />
            {show && (
                <div style={{
                    position: 'absolute',
                    bottom: '100%',
                    right: 0,
                    marginBottom: 6,
                    background: '#0f172a',
                    color: '#f8fafc',
                    padding: '8px 12px',
                    borderRadius: 6,
                    fontSize: '0.7rem',
                    lineHeight: 1.5,
                    width: 240,
                    zIndex: 100,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    pointerEvents: 'none',
                }}>
                    <strong style={{ color: '#38bdf8' }}>How Trend is Calculated</strong><br />
                    Compares avg yield of the <b>last 30 days</b> vs the <b>prior 30 days</b>.<br />
                    • &gt;1% higher → <span style={{ color: '#22c55e' }}>Improving</span><br />
                    • &gt;1% lower → <span style={{ color: '#ef4444' }}>Declining</span><br />
                    • Otherwise → <span style={{ color: '#94a3b8' }}>Stable</span><br />
                    <span style={{ opacity: 0.7 }}>Requires ≥60 data points.</span>
                </div>
            )}
        </div>
    );
});

const MachineKPIs = memo(function MachineKPIs({
    currentYield,
    goodCount,
    totalCount,
    trendDirection
}: {
    currentYield: number;
    goodCount: number;
    totalCount: number;
    trendDirection: 'up' | 'down' | 'stable';
}) {
    const getColor = (v: number) => v >= 95 ? '#22c55e' : v >= 85 ? '#f59e0b' : '#ef4444';
    const trendIcon = trendDirection === 'up' ? '📈' : trendDirection === 'down' ? '📉' : '➡️';
    const trendLabel = trendDirection === 'up' ? 'Improving' : trendDirection === 'down' ? 'Declining' : 'Stable';
    const trendColor = trendDirection === 'up' ? '#22c55e' : trendDirection === 'down' ? '#ef4444' : '#64748b';

    const StatCard = ({ label, value, subtext, color }: { label: string; value: string; subtext?: string; color: string }) => (
        <div style={{
            flex: 1,
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 4,
            padding: '4px 8px',
            textAlign: 'center',
            transition: 'background 0.2s',
        }}>
            <div style={{ fontSize: '0.5rem', color: 'var(--text-dim)', letterSpacing: '0.02em' }}>{label}</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color }}>{value}</div>
            {subtext && <div style={{ fontSize: '0.5rem', color: 'var(--text-dim)', marginTop: -1 }}>{subtext}</div>}
        </div>
    );

    return (
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <StatCard
                label="YIELD"
                value={`${currentYield.toFixed(1)}%`}
                color={getColor(currentYield)}
            />
            <StatCard
                label="✅ GOOD"
                value={goodCount.toLocaleString()}
                color="#22c55e"
            />
            <StatCard
                label="📦 TOTAL"
                value={totalCount.toLocaleString()}
                color="var(--text-main, #f1f5f9)"
            />
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', borderRadius: 4, padding: '4px 8px', textAlign: 'center', position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <div style={{ fontSize: '0.5rem', color: 'var(--text-dim)', letterSpacing: '0.02em' }}>{trendIcon} TREND</div>
                    <TrendInfoTooltip />
                </div>
                <div style={{ fontSize: '0.9rem', fontWeight: 700, color: trendColor }}>{trendLabel}</div>
            </div>
        </div>
    );
});

// =============================================================================
// MACHINE TREND CHART
// =============================================================================

const MachineTrendChart = memo(function MachineTrendChart({
    historyData,
    mcNumber,
    redThreshold,
    yellowThreshold
}: {
    historyData: YieldHistoryRecord[];
    mcNumber: number;
    redThreshold: number;
    yellowThreshold: number;
}) {
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!chartRef.current) return;

        if (historyData.length === 0) {
            chartRef.current.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-dim);font-size:0.9rem;">No historical data available</div>';
            return;
        }

        // Group by date and calculate daily yield
        const dailyData = new Map<string, { good: number; total: number }>();
        historyData.forEach(record => {
            const existing = dailyData.get(record.date) || { good: 0, total: 0 };
            existing.good += record.goodCount;
            existing.total += record.totalCount;
            dailyData.set(record.date, existing);
        });

        const sortedDates = Array.from(dailyData.keys()).sort();
        const yields = sortedDates.map(date => {
            const data = dailyData.get(date)!;
            return data.total > 0 ? (data.good / data.total) * 100 : 0;
        });

        const mainTrace = {
            type: 'scatter',
            mode: 'lines+markers',
            name: `MC-${mcNumber}`,
            x: sortedDates,
            y: yields,
            line: { color: '#3b82f6', width: 2.5, shape: 'linear' },
            marker: { size: 6, color: yields.map(y => y >= yellowThreshold ? '#22c55e' : y >= redThreshold ? '#f59e0b' : '#ef4444') },
            fill: 'tozeroy',
            fillcolor: 'rgba(59, 130, 246, 0.1)',
            hovertemplate: '<b>%{x}</b><br>Yield: <b>%{y:.1f}%</b><extra></extra>',
        };

        const targetTrace = {
            type: 'scatter',
            mode: 'lines',
            name: `Target (${yellowThreshold}%)`,
            x: [sortedDates[0], sortedDates[sortedDates.length - 1]],
            y: [yellowThreshold, yellowThreshold],
            line: { color: '#22c55e', width: 1.5, dash: 'dot' },
            hoverinfo: 'skip',
        };

        const criticalTrace = {
            type: 'scatter',
            mode: 'lines',
            name: `Critical (${redThreshold}%)`,
            x: [sortedDates[0], sortedDates[sortedDates.length - 1]],
            y: [redThreshold, redThreshold],
            line: { color: '#ef4444', width: 1.5, dash: 'dot' },
            hoverinfo: 'skip',
        };

        const layout = {
            autosize: true,
            margin: { l: 40, r: 10, t: 20, b: 5 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            font: { color: '#94a3b8', size: 10 },
            xaxis: {
                gridcolor: 'rgba(255,255,255,0.05)',
                type: 'date',
                tickformat: '%b %d',
                tickangle: -30,
                showgrid: true,
                zeroline: false,
                rangeslider: {
                    visible: true,
                    thickness: 0.04,
                    bgcolor: 'rgba(100, 116, 139, 0.2)',
                    bordercolor: 'rgba(100, 116, 139, 0.3)',
                    borderwidth: 1,
                },
            },
            yaxis: {
                gridcolor: 'rgba(255,255,255,0.05)',
                range: [Math.min(...yields, 80) - 5, 100],
                ticksuffix: '%',
                showgrid: true,
                zeroline: false,
                fixedrange: false,
            },
            shapes: [
                {
                    type: 'rect',
                    xref: 'paper',
                    yref: 'y',
                    x0: 0,
                    x1: 1,
                    y0: 0,
                    y1: 85,
                    fillcolor: 'rgba(239, 68, 68, 0.05)',
                    line: { width: 0 },
                },
            ],
            legend: {
                orientation: 'h',
                y: 1.02,
                x: 0,
                xanchor: 'left',
                font: { size: 10 },
                bgcolor: 'transparent',
            },
        };

        const config = {
            displayModeBar: true,
            modeBarButtonsToInclude: [
                'zoom2d', 'pan2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d', 'resetScale2d',
                'toImage'
            ],
            modeBarButtonsToRemove: ['lasso2d', 'select2d'],
            displaylogo: false,
            responsive: true,
        };

        Plotly.newPlot(chartRef.current, [mainTrace, targetTrace, criticalTrace], layout, config);

        return () => { if (chartRef.current) Plotly.purge(chartRef.current); };
    }, [historyData, mcNumber]);

    return <div ref={chartRef} style={{ width: '100%', height: '100%' }} />;
});

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export const YieldAnalyticsModal = memo(function YieldAnalyticsModal({
    isOpen,
    onClose,
    mode,
    machine,
    lineInfo,
}: YieldAnalyticsModalProps) {
    const { getDateRange, settings } = useLogAnalyzerSettingsSafe();
    const [historyData, setHistoryData] = useState<Map<number, YieldHistoryRecord[]>>(new Map());
    const [loading, setLoading] = useState(false);

    // Refs to access latest data without triggering re-fetch
    const lineInfoRef = useRef(lineInfo);
    const machineRef = useRef(machine);
    lineInfoRef.current = lineInfo;
    machineRef.current = machine;

    // Stable IDs for dependencies
    const lineId = lineInfo?.lineNumber;
    const machineId = machine?.mcId;

    // Fetch historical data for trend
    const fetchHistory = useCallback(async () => {
        setLoading(true);
        try {
            // Use global date range from settings context
            const { from, to } = getDateRange();

            const formatDate = (d: Date) => {
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };
            const start = formatDate(from);
            const end = formatDate(to);
            const newMap = new Map<number, YieldHistoryRecord[]>();

            if (mode === 'line' && lineInfoRef.current) {
                // Fetch for all machines in line
                for (const m of lineInfoRef.current.machines) {
                    if (m.mcId == null) continue; // Skip only if mcId is explicitly missing
                    try {
                        const history = await YieldService.getHistory(m.mcId, start, end);
                        if (history && history.length > 0) {
                            newMap.set(m.mcId, history);
                        }
                    } catch (e) {
                        console.warn(`Failed to fetch history for MC ${m.mcId}`, e);
                    }
                }
            } else if (mode === 'machine' && machineRef.current) {
                // Fetch for single machine
                const currentMcId = machineRef.current.mcId;
                if (currentMcId == null) {
                    setLoading(false);
                    return;
                }
                try {
                    const history = await YieldService.getHistory(currentMcId, start, end);
                    if (history && history.length > 0) {
                        newMap.set(currentMcId, history);
                    }
                } catch (e) {
                    console.warn(`Failed to fetch history for MC ${machineRef.current?.mcId}`, e);
                }
            }
            setHistoryData(newMap);
        } finally {
            setLoading(false);
        }
    }, [mode, lineId, machineId, settings.dateRange, getDateRange]); // Re-fetch when date range changes

    useEffect(() => {
        if (isOpen) fetchHistory();
    }, [isOpen, fetchHistory]);

    // ESC handler
    useEffect(() => {
        if (!isOpen) return;
        const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    // Calculate Line KPIs
    const machines = lineInfo?.machines || [];
    const currentYield = machines.length > 0
        ? machines.reduce((sum, m) => sum + m.yield, 0) / machines.length
        : 0;

    // Find Min/Max machines
    const sortedMachines = [...machines].sort((a, b) => a.yield - b.yield);
    const minMachine = sortedMachines.length > 0 ? sortedMachines[0] : null;
    const maxMachine = sortedMachines.length > 0 ? sortedMachines[sortedMachines.length - 1] : null;

    const title = mode === 'line'
        ? `Line ${lineInfo?.lineNumber}`
        : `MC-${machine?.mcNumber}`;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={STYLES.overlay}
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    style={STYLES.modal}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div style={STYLES.header}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <TrendingUp size={16} color="#22c55e" />
                            <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{title} Yield Analysis</span>
                        </div>
                        <button onClick={onClose} style={STYLES.closeBtn}>
                            ESC <X size={12} />
                        </button>
                    </div>

                    {/* Content */}
                    <div style={STYLES.content}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                                Loading...
                            </div>
                        ) : mode === 'line' && lineInfo ? (
                            <>
                                {/* Line KPIs */}
                                <LineKPIs
                                    currentYield={currentYield}
                                    minMachine={minMachine}
                                    maxMachine={maxMachine}
                                    machineCount={machines.length}
                                />

                                {/* Advanced Trend Chart */}
                                <div style={STYLES.chartSection}>
                                    <AdvancedTrendChart
                                        historyData={historyData}
                                        machines={machines}
                                        lineNumber={lineInfo.lineNumber}
                                        redThreshold={settings.redThreshold}
                                        yellowThreshold={settings.yellowThreshold}
                                    />
                                </div>
                            </>
                        ) : mode === 'machine' && machine ? (
                            <>
                                {/* Machine KPIs */}
                                {(() => {
                                    const machineHistory = historyData.get(machine.mcId) || [];
                                    const totalGood = machineHistory.reduce((sum, r) => sum + r.goodCount, 0);
                                    const totalCount = machineHistory.reduce((sum, r) => sum + r.totalCount, 0);

                                    // Calculate trend from last 30 days vs prior 30 days (client requirement)
                                    const sortedHistory = [...machineHistory].sort((a, b) => a.date.localeCompare(b.date));
                                    let trendDirection: 'up' | 'down' | 'stable' = 'stable';
                                    if (sortedHistory.length >= 60) {
                                        const recent30 = sortedHistory.slice(-30);
                                        const prior30 = sortedHistory.slice(-60, -30);
                                        const recentAvg = recent30.reduce((s, r) => s + r.yieldPercentage, 0) / 30;
                                        const priorAvg = prior30.reduce((s, r) => s + r.yieldPercentage, 0) / 30;
                                        if (recentAvg > priorAvg + 1) trendDirection = 'up';
                                        else if (recentAvg < priorAvg - 1) trendDirection = 'down';
                                    }

                                    return (
                                        <MachineKPIs
                                            currentYield={machine.yield}
                                            goodCount={totalGood}
                                            totalCount={totalCount}
                                            trendDirection={trendDirection}
                                        />
                                    );
                                })()}

                                {/* Machine Trend Chart */}
                                <div style={STYLES.chartSection}>
                                    <MachineTrendChart
                                        historyData={historyData.get(machine.mcId) || []}
                                        mcNumber={machine.mcNumber}
                                        redThreshold={settings.redThreshold}
                                        yellowThreshold={settings.yellowThreshold}
                                    />
                                </div>
                            </>
                        ) : (
                            <div style={{ textAlign: 'center', padding: 50, color: 'var(--text-dim)' }}>
                                Machine Analysis coming soon
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
});

export default YieldAnalyticsModal;
