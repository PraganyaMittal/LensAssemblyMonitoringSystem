import { useEffect, useState, useMemo, useRef } from 'react';
import { YieldService, DailySummary, TrayRecord } from '../../services/YieldService';
import { X, ChevronDown, Package, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLogAnalyzerSettingsSafe } from '../../features/LogAnalyzer/context';
import { exportYieldToExcel } from '../../services/ExcelExportService';




interface Props {
    mcId: number;
    mcName: string;
    isOpen: boolean;
    onClose: () => void;
}

const tokens = {
    colors: {
        primary: { main: '#3b82f6', dim: 'rgba(59, 130, 246, 0.1)' },
        text: { main: '#e2e8f0', secondary: '#94a3b8', dim: '#64748b' },
        bg: { card: '#1e293b', panel: '#0f172a' },
        border: 'rgba(148, 163, 184, 0.1)',
        borderLight: 'rgba(255, 255, 255, 0.1)',
    },
    spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem' },
    radius: { sm: '4px', md: '8px', lg: '12px' }
};




export default function YieldHistoryModal({ mcId, mcName, isOpen, onClose }: Props) {
    const [dailySummaries, setDailySummaries] = useState<DailySummary[]>([]);
    const [loading, setLoading] = useState(false);

    
    const [selectedYear, setSelectedYear] = useState<number | null>(null);
    const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
    const [selectedDay, setSelectedDay] = useState<number | null>(null);
    const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);

    
    const [trayData, setTrayData] = useState<Record<string, { trays: TrayRecord[] | null; loading: boolean }>>({});

    const { getDateRange, settings } = useLogAnalyzerSettingsSafe();

    
    const formatDateKey = (d: Date | string) => {
        if (typeof d === 'string') {
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
        if (isOpen && mcId != null) {
            fetchSummaries();
            setSelectedDateKey(null);
            setTrayData({});
            
            setSelectedYear(null);
            setSelectedMonth(null);
            setSelectedDay(null);
        }
    }, [isOpen, mcId, settings.dateRange]);

    
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const fetchSummaries = async () => {
        setLoading(true);
        try {
            const { from, to } = getDateRange();
            
            const data = await YieldService.getHistorySummary(mcId, formatDateKey(from), formatDateKey(to));
            setDailySummaries(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    
    const hierarchy = useMemo(() => {
        const _hierarchy = new Map<number, Map<number, Map<number, DailySummary>>>();
        dailySummaries.forEach(s => {
            const d = new Date(s.date);
            const year = d.getFullYear();
            const month = d.getMonth();
            const day = d.getDate();

            if (!_hierarchy.has(year)) _hierarchy.set(year, new Map());
            const yearMap = _hierarchy.get(year)!;

            if (!yearMap.has(month)) yearMap.set(month, new Map());
            const monthMap = yearMap.get(month)!;

            monthMap.set(day, s);
        });
        return _hierarchy;
    }, [dailySummaries]);

    const availableYears = useMemo(() =>
        Array.from(hierarchy.keys()).sort((a, b) => b - a),
        [hierarchy]);

    const availableMonths = useMemo(() => {
        if (!selectedYear) return [];
        const yearMap = hierarchy.get(selectedYear);
        return yearMap ? Array.from(yearMap.keys()).sort((a, b) => b - a) : [];
    }, [selectedYear, hierarchy]);

    const availableDays = useMemo(() => {
        if (!selectedYear || selectedMonth === null) return [];
        const monthMap = hierarchy.get(selectedYear)?.get(selectedMonth);
        return monthMap ? Array.from(monthMap.keys()).sort((a, b) => b - a) : [];
    }, [selectedYear, selectedMonth, hierarchy]);

    
    useEffect(() => {
        if (selectedYear && selectedMonth !== null && selectedDay) {
            const mStr = String(selectedMonth + 1).padStart(2, '0');
            const dStr = String(selectedDay).padStart(2, '0');
            const key = `${selectedYear}-${mStr}-${dStr}`;
            setSelectedDateKey(key);
        } else {
            setSelectedDateKey(null);
        }
    }, [selectedYear, selectedMonth, selectedDay]);

    
    useEffect(() => {
        if (availableYears.length > 0 && !selectedYear) {
            setSelectedYear(availableYears[0]);
        }
    }, [availableYears, selectedYear]);

    useEffect(() => {
        if (selectedYear && availableMonths.length > 0) {
            if (selectedMonth === null || !availableMonths.includes(selectedMonth)) {
                setSelectedMonth(availableMonths[0]);
            }
        } else {
            if (availableMonths.length === 0) setSelectedMonth(null);
        }
    }, [selectedYear, availableMonths, selectedMonth]);

    useEffect(() => {
        if (selectedYear && selectedMonth !== null && availableDays.length > 0) {
            if (selectedDay === null || !availableDays.includes(selectedDay)) {
                setSelectedDay(availableDays[0]);
            }
        } else {
            if (availableDays.length === 0) setSelectedDay(null);
        }
    }, [selectedYear, selectedMonth, availableDays, selectedDay]);


    
    useEffect(() => {
        if (selectedDateKey && !trayData[selectedDateKey]) {
            loadTrays(selectedDateKey);
        }
    }, [selectedDateKey]);

    const loadTrays = async (dateKey: string) => {
        setTrayData(prev => ({ ...prev, [dateKey]: { trays: null, loading: true } }));
        try {
            const trays = await YieldService.getHistoryByDate(mcId, dateKey);
            setTrayData(prev => ({ ...prev, [dateKey]: { trays, loading: false } }));
        } catch (e) {
            console.error(e);
            setTrayData(prev => ({ ...prev, [dateKey]: { trays: [], loading: false } }));
        }
    };

    const getYieldColor = (yield_: number) => {
        if (yield_ >= settings.yellowThreshold) return '#22c55e';
        if (yield_ >= settings.redThreshold) return '#f59e0b';
        return '#ef4444';
    };

    const getMonthName = (m: number) => new Date(2000, m, 1).toLocaleString('default', { month: 'long' });

    if (!isOpen) return null;

    
    const currentSummary = (selectedYear && selectedMonth !== null && selectedDay)
        ? hierarchy.get(selectedYear)?.get(selectedMonth)?.get(selectedDay)
        : null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.7)', zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '2rem'
        }}>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                style={{
                    background: tokens.colors.bg.card,
                    width: '900px',
                    maxWidth: '95vw',
                    height: '85vh',
                    borderRadius: tokens.radius.lg,
                    display: 'flex',
                    flexDirection: 'column',
                    border: `1px solid ${tokens.colors.border}`,
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                    overflow: 'hidden'
                }}
            >
                {}
                <div style={{
                    padding: `${tokens.spacing.md} ${tokens.spacing.lg}`,
                    borderBottom: `1px solid ${tokens.colors.border}`,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'rgba(15, 23, 42, 0.5)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', color: tokens.colors.text.main, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Package size={20} color={tokens.colors.primary.main} />
                                Yield History
                            </h3>
                            <div style={{ fontSize: '0.875rem', color: tokens.colors.text.secondary }}>
                                MC-{mcName}
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 10px',
                            cursor: 'pointer',
                            color: tokens.colors.text.secondary,
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            fontSize: '0.75rem'
                        }}
                    >
                        ESC <X size={16} />
                    </button>
                </div>

                {}
                <div style={{
                    padding: `${tokens.spacing.md} ${tokens.spacing.lg}`,
                    borderBottom: `1px solid ${tokens.colors.border}`,
                    display: 'flex', gap: tokens.spacing.md, alignItems: 'center'
                }}>
                    <Dropdown
                        label="Year"
                        options={availableYears.map(String)}
                        value={selectedYear?.toString() || ''}
                        onChange={(v) => setSelectedYear(parseInt(v))}
                        placeholder="Select Year"
                    />
                    <Dropdown
                        label="Month"
                        options={availableMonths.map(m => getMonthName(m))}
                        value={selectedMonth !== null ? getMonthName(selectedMonth) : ''}
                        onChange={(v) => {
                            const idx = Array.from({ length: 12 }, (_, i) => getMonthName(i)).indexOf(v);
                            if (idx !== -1) setSelectedMonth(idx);
                        }}
                        placeholder="Select Month"
                        disabled={selectedYear === null}
                    />
                    <Dropdown
                        label="Date"
                        options={availableDays.map(String)}
                        value={selectedDay?.toString() || ''}
                        onChange={(v) => setSelectedDay(parseInt(v))}
                        placeholder="Select Date"
                        disabled={selectedMonth === null}
                    />

                    {}
                    {currentSummary && (
                        <div style={{
                            marginLeft: '1rem', paddingLeft: '1rem', borderLeft: `1px solid ${tokens.colors.border}`,
                            display: 'flex', gap: '1.5rem'
                        }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: tokens.colors.text.dim, textTransform: 'uppercase' }}>Trays</div>
                                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: tokens.colors.text.main }}>{currentSummary.trayCount}</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: tokens.colors.text.dim, textTransform: 'uppercase' }}>Yield</div>
                                <div style={{ fontSize: '1rem', fontWeight: 'bold', color: getYieldColor(currentSummary.avgYield) }}>
                                    {currentSummary.avgYield.toFixed(1)}%
                                </div>
                            </div>
                        </div>
                    )}

                    {}
                    <div style={{ marginLeft: 'auto' }}>
                        <button
                            onClick={() => {
                                exportYieldToExcel({
                                    mcName: mcName,
                                    dailySummaries: dailySummaries,
                                    trayData: undefined
                                });
                            }}
                            style={{
                                background: 'rgba(34, 197, 94, 0.1)',
                                border: '1px solid rgba(34, 197, 94, 0.3)',
                                borderRadius: '6px',
                                padding: '8px 12px',
                                color: '#22c55e',
                                cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px',
                                fontSize: '0.875rem'
                            }}
                        >
                            Export Summary
                        </button>
                    </div>
                </div>

                {}
                <div style={{ flex: 1, overflowY: 'auto', padding: tokens.spacing.lg, background: 'rgba(0,0,0,0.2)' }}>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: tokens.colors.text.secondary }}>
                            <Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} />
                        </div>
                    ) : selectedDateKey ? (
                        <TrayDetailView
                            data={trayData[selectedDateKey]}
                            getYieldColor={getYieldColor}
                        />
                    ) : (
                        <div style={{ textAlign: 'center', padding: '3rem', color: tokens.colors.text.secondary }}>
                            {availableYears.length === 0 ? "No history found." : "Select a Year, Month, and Date to view tray details."}
                        </div>
                    )}
                </div>
            </motion.div>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
}





function TrayDetailView({ data, getYieldColor }: {
    data: { trays: TrayRecord[] | null; loading: boolean } | undefined,
    getYieldColor: (y: number) => string
}) {
    if (!data || data.loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: tokens.colors.text.secondary }}>
                <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ marginLeft: '1rem' }}>Loading trays...</span>
            </div>
        );
    }

    if (!data.trays || data.trays.length === 0) {
        return <div style={{ textAlign: 'center', padding: '2rem', color: tokens.colors.text.dim }}>No tray records found.</div>;
    }

    return (
        <div style={{ height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: tokens.colors.bg.card, zIndex: 10 }}>
                    <tr style={{ color: tokens.colors.text.secondary, textAlign: 'left', borderBottom: `1px solid ${tokens.colors.borderLight}` }}>
                        <th style={{ padding: '1rem', fontWeight: 600 }}>Tray ID</th>
                        <th style={{ padding: '1rem', textAlign: 'right', fontWeight: 600 }}>Good</th>
                        <th style={{ padding: '1rem', textAlign: 'right', fontWeight: 600 }}>Total</th>
                        <th style={{ padding: '1rem', textAlign: 'right', fontWeight: 600 }}>Yield</th>
                    </tr>
                </thead>
                <tbody>
                    {data.trays.map((tray, i) => (
                        <tr key={i} style={{
                            borderBottom: `1px solid ${tokens.colors.border}`,
                            background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)'
                        }}>
                            <td style={{ padding: '0.75rem 1rem', fontFamily: 'monospace', color: tokens.colors.text.main }}>
                                {tray.trayId}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: tokens.colors.text.secondary }}>
                                {tray.goodCount}
                            </td>
                            <td style={{ padding: '0.75rem 1rem', textAlign: 'right', color: tokens.colors.text.secondary }}>
                                {tray.totalCount}
                            </td>
                            <td style={{
                                padding: '0.75rem 1rem',
                                textAlign: 'right',
                                fontWeight: 'bold',
                                color: getYieldColor(tray.yieldPercentage)
                            }}>
                                {tray.yieldPercentage.toFixed(1)}%
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}


function Dropdown({
    label,
    options,
    value,
    onChange,
    placeholder,
    disabled = false,
}: {
    label: string;
    options: string[];
    value: string | null;
    onChange: (value: string) => void;
    placeholder: string;
    disabled?: boolean;
}) {
    const [isOpen, setIsOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={wrapperRef} style={{ position: 'relative', minWidth: 160 }}>
            {}
            <div style={{
                fontSize: '0.7rem', fontWeight: 'bold', color: tokens.colors.text.dim,
                textTransform: 'uppercase', marginBottom: '4px', letterSpacing: '0.5px'
            }}>
                {label}
            </div>

            {}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                style={{
                    width: '100%',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: tokens.colors.bg.panel,
                    border: isOpen ? `1px solid ${tokens.colors.primary.main}` : `1px solid ${tokens.colors.border}`,
                    borderRadius: tokens.radius.sm,
                    padding: '8px 12px',
                    color: value ? tokens.colors.text.main : tokens.colors.text.dim,
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    opacity: disabled ? 0.5 : 1,
                    fontSize: '0.9rem',
                    transition: 'border 0.2s'
                }}
            >
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {value || placeholder}
                </span>
                <ChevronDown size={14} style={{ transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
            </button>

            {}
            <AnimatePresence>
                {isOpen && !disabled && (
                    <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        style={{
                            position: 'absolute', top: '100%', left: 0, right: 0,
                            marginTop: '4px',
                            background: tokens.colors.bg.card,
                            border: `1px solid ${tokens.colors.border}`,
                            borderRadius: tokens.radius.sm,
                            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
                            maxHeight: '200px',
                            overflowY: 'auto',
                            zIndex: 50
                        }}
                    >
                        {options.map((opt) => (
                            <div
                                key={opt}
                                onClick={() => { onChange(opt); setIsOpen(false); }}
                                style={{
                                    padding: '8px 12px',
                                    fontSize: '0.9rem',
                                    cursor: 'pointer',
                                    color: tokens.colors.text.secondary,
                                    background: value === opt ? 'rgba(59, 130, 246, 0.1)' : 'transparent',
                                    borderLeft: value === opt ? `2px solid ${tokens.colors.primary.main}` : '2px solid transparent'
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.color = tokens.colors.text.main}
                                onMouseLeave={(e) => e.currentTarget.style.color = tokens.colors.text.secondary}
                            >
                                {opt}
                            </div>
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
