import { useEffect, useState, useMemo, useCallback } from 'react';
import { YieldService, DailySummary, TrayRecord } from '../../services/YieldService';
import { X, Calendar, ChevronDown, ChevronRight, Package, TrendingUp, ArrowUpDown, Loader2, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLogAnalyzerSettingsSafe } from '../../features/LogAnalyzer/context';
import { exportYieldToExcel } from '../../services/ExcelExportService';

interface Props {
    mcId: number;
    mcName: string;
    isOpen: boolean;
    onClose: () => void;
}

export default function YieldHistoryModal({ mcId, mcName, isOpen, onClose }: Props) {
    const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
    const [trayData, setTrayData] = useState<Record<string, { trays: TrayRecord[] | null; loading: boolean }>>({});
    const [sortNewestFirst, setSortNewestFirst] = useState(true);
    // Cache for fallback mode (if backend summary endpoint fails)
    const [fallbackCache, setFallbackCache] = useState<Map<string, TrayRecord[]> | null>(null);

    const { getDateRange, settings } = useLogAnalyzerSettingsSafe();

    // Format date helper - robust handling for strings to avoid timezone shifts
    const formatDateKey = (d: Date | string) => {
        if (typeof d === 'string') {
            // If it's already YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss, just take the first 10 chars
            // This avoids any timezone conversion issues with new Date()
            if (d.includes('T')) return d.split('T')[0];
            if (d.length >= 10) return d.substring(0, 10);
            const date = new Date(d);
            return date.toISOString().split('T')[0];
        }
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    useEffect(() => {
        if (isOpen && mcId) {
            console.log('Open Yield History for MC:', mcId);
            fetchSummaries();
            setExpandedDates(new Set());
            setTrayData({});
        }
    }, [isOpen, mcId, settings.dateRange]);

    // ESC key to close modal
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Fetch only daily summaries (lightweight)
    // Falls back to old API with client-side grouping if new endpoint unavailable
    const fetchSummaries = async () => {
        setLoading(true);
        try {
            const { from, to } = getDateRange();
            try {
                // Try new optimized endpoint first
                const data = await YieldService.getHistorySummary(mcId, formatDateKey(from), formatDateKey(to));
                setDailySummaries(data);
                setFallbackCache(null); // Clear cache if new endpoint works
            } catch {
                // Fallback: fetch all records and group client-side (for backwards compatibility)
                console.warn('New summary endpoint not available, falling back to old API');
                const allRecords = await YieldService.getHistory(mcId, formatDateKey(from), formatDateKey(to));
                const grouped = new Map<string, { totalGood: number; totalCount: number; trayCount: number }>();
                const recordsCache = new Map<string, TrayRecord[]>();

                allRecords.forEach(r => {
                    const dateKey = formatDateKey(r.date);

                    // Group for summary
                    const existing = grouped.get(dateKey) || { totalGood: 0, totalCount: 0, trayCount: 0 };
                    grouped.set(dateKey, {
                        totalGood: existing.totalGood + r.goodCount,
                        totalCount: existing.totalCount + r.totalCount,
                        trayCount: existing.trayCount + 1
                    });

                    // Cache for details
                    const dateRecords = recordsCache.get(dateKey) || [];
                    dateRecords.push({
                        trayId: r.trayId,
                        goodCount: r.goodCount,
                        totalCount: r.totalCount,
                        yieldPercentage: r.yieldPercentage
                    });
                    recordsCache.set(dateKey, dateRecords);
                });

                console.log('Fallback cache populated keys:', Array.from(recordsCache.keys()));
                setFallbackCache(recordsCache);

                const summaries: DailySummary[] = [];
                grouped.forEach((v, k) => {
                    summaries.push({
                        date: k,
                        trayCount: v.trayCount,
                        totalGood: v.totalGood,
                        totalCount: v.totalCount,
                        avgYield: v.totalCount > 0 ? (v.totalGood / v.totalCount) * 100 : 0
                    });
                });
                setDailySummaries(summaries);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // Lazy-load trays for a specific date when expanded
    const fetchTraysForDate = useCallback(async (dateKey: string) => {
        console.log('Fetching trays for dateKey:', dateKey);

        // Skip if already loaded (trays is non-null array) or currently loading
        if (trayData[dateKey]?.trays != null || trayData[dateKey]?.loading) return;

        // Check fallback cache first
        if (fallbackCache && fallbackCache.has(dateKey)) {
            console.log('Hit fallback cache for:', dateKey);
            setTrayData(prev => ({
                ...prev,
                [dateKey]: { trays: fallbackCache.get(dateKey) || [], loading: false }
            }));
            return;
        }

        console.log('Missed cache, fetching from API for:', dateKey);
        setTrayData(prev => ({ ...prev, [dateKey]: { trays: null, loading: true } }));

        try {
            // Try new endpoint first
            const trays = await YieldService.getHistoryByDate(mcId, dateKey);
            setTrayData(prev => ({ ...prev, [dateKey]: { trays, loading: false } }));
        } catch {
            // Fallback: fetch all and filter client-side
            try {
                const allRecords = await YieldService.getHistory(mcId, dateKey, dateKey);
                const trays = allRecords.map(r => ({
                    trayId: r.trayId,
                    goodCount: r.goodCount,
                    totalCount: r.totalCount,
                    yieldPercentage: r.yieldPercentage
                }));
                setTrayData(prev => ({ ...prev, [dateKey]: { trays, loading: false } }));
            } catch (error) {
                console.error(error);
                setTrayData(prev => ({ ...prev, [dateKey]: { trays: [], loading: false } }));
            }
        }
    }, [mcId, trayData]);

    // Sort summaries
    const sortedSummaries = useMemo(() => {
        const sorted = [...dailySummaries];
        sorted.sort((a, b) => {
            const diff = new Date(b.date).getTime() - new Date(a.date).getTime();
            return sortNewestFirst ? diff : -diff;
        });
        return sorted;
    }, [dailySummaries, sortNewestFirst]);

    // Overall stats
    const overallStats = useMemo(() => {
        const totalDays = dailySummaries.length;
        const totalTrays = dailySummaries.reduce((sum, d) => sum + d.trayCount, 0);
        const totalGood = dailySummaries.reduce((sum, d) => sum + d.totalGood, 0);
        const totalCount = dailySummaries.reduce((sum, d) => sum + d.totalCount, 0);
        const overallYield = totalCount > 0 ? (totalGood / totalCount) * 100 : 0;
        return { totalDays, totalTrays, totalGood, totalCount, overallYield };
    }, [dailySummaries]);

    const toggleDate = (dateKey: string) => {
        setExpandedDates(prev => {
            const next = new Set(prev);
            if (next.has(dateKey)) {
                next.delete(dateKey);
            } else {
                next.add(dateKey);
                // Lazy load trays when expanding
                fetchTraysForDate(dateKey);
            }
            return next;
        });
    };

    // Removed expandAll - we don't want users to load all data at once

    const collapseAll = () => {
        setExpandedDates(new Set());
    };

    const getYieldColor = (yield_: number) => {
        if (yield_ >= settings.yellowThreshold) return '#22c55e';
        if (yield_ >= settings.redThreshold) return '#f59e0b';
        return '#ef4444';
    };

    const formatDisplayDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    if (!isOpen) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                    background: 'var(--bg-card)',
                    width: '700px',
                    maxHeight: '85vh',
                    borderRadius: '10px',
                    display: 'flex',
                    flexDirection: 'column',
                    border: '1px solid var(--border)',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.3)'
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(59, 130, 246, 0.05)'
                }}>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Package size={18} color="#3b82f6" />
                        Yield History: <span style={{ color: '#3b82f6' }}>MC-{mcName}</span>
                    </h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.08)',
                            border: 'none',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontSize: '0.6rem',
                            color: 'var(--text-dim)'
                        }}
                    >
                        ESC <X size={12} />
                    </button>
                </div>

                {/* Summary Stats Bar */}
                {!loading && dailySummaries.length > 0 && (
                    <div style={{
                        display: 'flex',
                        gap: '1rem',
                        padding: '0.75rem 1.25rem',
                        borderBottom: '1px solid var(--border)',
                        background: 'rgba(255,255,255,0.02)'
                    }}>
                        <div style={{ textAlign: 'center', flex: 1 }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Days</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>{overallStats.totalDays}</div>
                        </div>
                        <div style={{ width: '1px', background: 'var(--border)' }} />
                        <div style={{ textAlign: 'center', flex: 1 }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Total Trays</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>{overallStats.totalTrays.toLocaleString()}</div>
                        </div>
                        <div style={{ width: '1px', background: 'var(--border)' }} />
                        <div style={{ textAlign: 'center', flex: 1 }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Good / Total</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                                {overallStats.totalGood.toLocaleString()} / {overallStats.totalCount.toLocaleString()}
                            </div>
                        </div>
                        <div style={{ width: '1px', background: 'var(--border)' }} />
                        <div style={{ textAlign: 'center', flex: 1 }}>
                            <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Overall Yield</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: getYieldColor(overallStats.overallYield) }}>
                                {overallStats.overallYield.toFixed(1)}%
                            </div>
                        </div>
                    </div>
                )}

                {/* Controls Bar */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 1.25rem',
                    borderBottom: '1px solid var(--border)',
                    fontSize: '0.8rem'
                }}>
                    {/* Date Range Indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-dim)' }}>
                        <Calendar size={14} />
                        <span>
                            {settings.dateRange.mode === 'today' && 'Today'}
                            {settings.dateRange.mode === 'last1' && 'Last 1 Day'}
                            {settings.dateRange.mode === 'last7' && 'Last 7 Days'}
                            {settings.dateRange.mode === 'last30' && 'Last 30 Days'}
                            {settings.dateRange.mode === 'custom' && `${settings.dateRange.customFrom} to ${settings.dateRange.customTo}`}
                        </span>
                    </div>

                    <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
                        {/* Export Button */}
                        <button
                            onClick={() => {
                                const loadedTrayData: Record<string, TrayRecord[]> = {};
                                Object.entries(trayData).forEach(([date, state]) => {
                                    if (state.trays && state.trays.length > 0) {
                                        loadedTrayData[date] = state.trays;
                                    }
                                });
                                exportYieldToExcel({
                                    mcName: mcName,
                                    dailySummaries: dailySummaries,
                                    trayData: Object.keys(loadedTrayData).length > 0 ? loadedTrayData : undefined
                                });
                            }}
                            style={{
                                background: 'rgba(34, 197, 94, 0.1)',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                color: '#22c55e',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem'
                            }}
                            title="Export to Excel"
                        >
                            <Download size={12} />
                            Export
                        </button>

                        {/* Sort Toggle */}
                        <button
                            onClick={() => setSortNewestFirst(!sortNewestFirst)}
                            style={{
                                background: 'rgba(59, 130, 246, 0.1)',
                                border: '1px solid rgba(59, 130, 246, 0.3)',
                                borderRadius: '4px',
                                padding: '4px 8px',
                                color: '#3b82f6',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '0.75rem'
                            }}
                        >
                            <ArrowUpDown size={12} />
                            {sortNewestFirst ? 'Newest First' : 'Oldest First'}
                        </button>

                        {/* Collapse All - only show when dates are expanded */}
                        {expandedDates.size > 0 && (
                            <button
                                onClick={collapseAll}
                                style={{
                                    background: 'rgba(255,255,255,0.05)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '4px',
                                    padding: '4px 8px',
                                    color: 'var(--text-dim)',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem'
                                }}
                            >
                                Collapse All
                            </button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
                    {loading ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                            <div style={{ marginTop: '0.5rem' }}>Loading summaries...</div>
                        </div>
                    ) : sortedSummaries.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-dim)' }}>
                            No records found for this date range.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {sortedSummaries.map((summary) => {
                                const dateKey = formatDateKey(summary.date);
                                const isExpanded = expandedDates.has(dateKey);
                                const trayState = trayData[dateKey];

                                return (
                                    <div key={dateKey} style={{
                                        border: '1px solid var(--border)',
                                        borderRadius: '6px',
                                        overflow: 'hidden',
                                        background: 'rgba(255,255,255,0.01)'
                                    }}>
                                        {/* Date Header - Collapsible */}
                                        <div
                                            onClick={() => toggleDate(dateKey)}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                padding: '0.6rem 0.75rem',
                                                cursor: 'pointer',
                                                background: isExpanded ? 'rgba(59, 130, 246, 0.08)' : 'transparent',
                                                transition: 'background 0.2s',
                                                userSelect: 'none'
                                            }}
                                        >
                                            {/* Chevron */}
                                            <div style={{ color: '#3b82f6', marginRight: '0.5rem' }}>
                                                {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                                            </div>

                                            {/* Date */}
                                            <div style={{ fontWeight: 600, color: 'var(--text-main)', fontSize: '0.9rem' }}>
                                                {formatDisplayDate(summary.date)}
                                            </div>

                                            {/* Tray Count */}
                                            <div style={{
                                                marginLeft: '0.75rem',
                                                padding: '2px 8px',
                                                borderRadius: '10px',
                                                background: 'rgba(59, 130, 246, 0.15)',
                                                fontSize: '0.75rem',
                                                color: '#3b82f6',
                                                fontWeight: 500
                                            }}>
                                                {summary.trayCount} trays
                                            </div>

                                            {/* Stats on Right */}
                                            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '1rem' }}>
                                                <span style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                                                    {summary.totalGood.toLocaleString()} / {summary.totalCount.toLocaleString()}
                                                </span>

                                                {/* Yield Badge */}
                                                <div style={{
                                                    padding: '2px 10px',
                                                    borderRadius: '10px',
                                                    background: `${getYieldColor(summary.avgYield)}55`,
                                                    border: `1px solid ${getYieldColor(summary.avgYield)}70`,
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '4px'
                                                }}>
                                                    <TrendingUp size={12} color="#fff" />
                                                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>
                                                        {summary.avgYield.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded Tray List (Lazy Loaded) */}
                                        <AnimatePresence>
                                            {isExpanded && (
                                                <motion.div
                                                    initial={{ height: 0, opacity: 0 }}
                                                    animate={{ height: 'auto', opacity: 1 }}
                                                    exit={{ height: 0, opacity: 0 }}
                                                    transition={{ duration: 0.2 }}
                                                    style={{ overflow: 'hidden' }}
                                                >
                                                    {trayState?.loading ? (
                                                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-dim)' }}>
                                                            <Loader2 size={16} style={{ animation: 'spin 1s linear infinite', display: 'inline-block' }} />
                                                            <span style={{ marginLeft: '0.5rem' }}>Loading trays...</span>
                                                        </div>
                                                    ) : trayState?.trays && trayState.trays.length > 0 ? (
                                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                                            <thead>
                                                                <tr style={{
                                                                    background: 'rgba(0,0,0,0.2)',
                                                                    color: 'var(--text-dim)',
                                                                    textAlign: 'left'
                                                                }}>
                                                                    <th style={{ padding: '0.4rem 0.75rem' }}>Tray ID</th>
                                                                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>Good</th>
                                                                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>Total</th>
                                                                    <th style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>Yield</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody>
                                                                {trayState.trays.map((tray, i) => (
                                                                    <tr
                                                                        key={i}
                                                                        style={{
                                                                            borderTop: '1px solid var(--border-light)',
                                                                            background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'
                                                                        }}
                                                                    >
                                                                        <td style={{ padding: '0.4rem 0.75rem', fontFamily: 'monospace' }}>
                                                                            {tray.trayId}
                                                                        </td>
                                                                        <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>
                                                                            {tray.goodCount}
                                                                        </td>
                                                                        <td style={{ padding: '0.4rem 0.75rem', textAlign: 'right' }}>
                                                                            {tray.totalCount}
                                                                        </td>
                                                                        <td style={{
                                                                            padding: '0.4rem 0.75rem',
                                                                            textAlign: 'right',
                                                                            fontWeight: 600,
                                                                            color: getYieldColor(tray.yieldPercentage)
                                                                        }}>
                                                                            {tray.yieldPercentage.toFixed(1)}%
                                                                        </td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    ) : (
                                                        <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-dim)', fontSize: '0.85rem' }}>
                                                            No tray records for this date.
                                                        </div>
                                                    )}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </motion.div >

            {/* CSS for spinner animation */}
            < style > {`
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style >
        </div >
    );
}
