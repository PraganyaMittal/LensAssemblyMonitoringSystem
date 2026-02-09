/**
 * SettingsModal - Global Log Analyzer Settings
 *
 * Features:
 * - Yield threshold configuration with live preview
 * - Date range selection for yield history
 * - Shift time configuration (Day/Night)
 * - Alert settings (threshold, cooldown, history)
 * - ESC key to close
 * - Modern React patterns (Hooks, useCallback)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings, Save, Calendar, Clock, Bell, Info } from 'lucide-react';
import { useLogAnalyzerSettings, type DateRangeMode } from '../../context';
import { Speedometer } from '../Speedometer';

// =============================================================================
// TYPES
// =============================================================================

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

// =============================================================================
// STYLES
// =============================================================================

const STYLES = {
    overlay: {
        position: 'fixed' as const,
        inset: 0,
        background: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    modal: {
        background: 'var(--bg-card, #1e293b)',
        borderRadius: 12,
        padding: 24,
        width: 700,
        maxWidth: '95vw',
        maxHeight: '95vh',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    section: {
        background: 'var(--bg-panel, rgba(255,255,255,0.03))',
        borderRadius: 8,
        padding: 16,
        marginBottom: 16,
    },
    sectionTitle: {
        margin: '0 0 12px 0',
        fontSize: '0.9rem',
        fontWeight: 600,
        color: 'var(--text-main, #f1f5f9)',
    },
    closeButton: {
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        padding: '4px 8px',
        borderRadius: 4,
        color: 'var(--text-dim, #94a3b8)',
        fontSize: '0.7rem',
    },
} as const;

// =============================================================================
// COMPONENT
// =============================================================================

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
    const { settings, updateSettings } = useLogAnalyzerSettings();

    // Local state for editing - Yield Thresholds
    const [redThreshold, setRedThreshold] = useState(settings.redThreshold);
    const [yellowThreshold, setYellowThreshold] = useState(settings.yellowThreshold);
    const [dateMode, setDateMode] = useState<DateRangeMode>(settings.dateRange?.mode || 'last7');
    const [customFrom, setCustomFrom] = useState(settings.dateRange.customFrom || '');
    const [customTo, setCustomTo] = useState(settings.dateRange.customTo || '');

    // Local state for Shift Configuration
    const [dayShiftStart, setDayShiftStart] = useState(settings.shiftConfig?.dayShiftStart || '08:00');
    const [nightShiftStart, setNightShiftStart] = useState(settings.shiftConfig?.nightShiftStart || '20:00');

    // Local state for Alert Configuration
    const [alertThreshold, setAlertThreshold] = useState(settings.alertConfig?.threshold || 85);
    const [cooldownMinutes, setCooldownMinutes] = useState(settings.alertConfig?.cooldownMinutes || 60);
    const [historyDays, setHistoryDays] = useState(settings.alertConfig?.historyDays || 7);

    // Sync local state when settings change
    useEffect(() => {
        setRedThreshold(settings.redThreshold);
        setYellowThreshold(settings.yellowThreshold);
        setDateMode(settings.dateRange.mode);
        setCustomFrom(settings.dateRange.customFrom || '');
        setCustomTo(settings.dateRange.customTo || '');
        setDayShiftStart(settings.shiftConfig?.dayShiftStart || '08:00');
        setNightShiftStart(settings.shiftConfig?.nightShiftStart || '20:00');
        setAlertThreshold(settings.alertConfig?.threshold || 85);
        setCooldownMinutes(settings.alertConfig?.cooldownMinutes || 60);
        setHistoryDays(settings.alertConfig?.historyDays || 30);
    }, [settings]);

    // ESC key listener
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Preview segments
    const previewSegments = [
        { start: 0, end: redThreshold, color: '#ef4444' },
        { start: redThreshold, end: yellowThreshold, color: '#f59e0b' },
        { start: yellowThreshold, end: 100, color: '#22c55e' },
    ];

    // Get yield color for preview
    const previewValue = 92;
    const yieldColor = previewValue >= yellowThreshold ? '#22c55e' :
        previewValue >= redThreshold ? '#f59e0b' : '#ef4444';

    const handleSave = useCallback(() => {
        updateSettings({
            redThreshold,
            yellowThreshold,
            dateRange: {
                mode: dateMode,
                customFrom: dateMode === 'custom' ? customFrom : undefined,
                customTo: dateMode === 'custom' ? customTo : undefined,
            },
            shiftConfig: {
                dayShiftStart,
                nightShiftStart,
            },
            alertConfig: {
                threshold: alertThreshold,
                cooldownMinutes,
                historyDays,
            },
        });
        onClose();
    }, [redThreshold, yellowThreshold, dateMode, customFrom, customTo, dayShiftStart, nightShiftStart, alertThreshold, cooldownMinutes, historyDays, updateSettings, onClose]);

    const handleReset = useCallback(() => {
        setRedThreshold(85);
        setRedThreshold(85);
        setYellowThreshold(95);
        setDateMode('last7');
        setCustomFrom('');
        setCustomTo('');
        setDayShiftStart('08:00');
        setNightShiftStart('20:00');
        setAlertThreshold(85);
        setCooldownMinutes(60);
        setHistoryDays(7);
    }, []);

    const dateOptions: { value: DateRangeMode; label: string }[] = [
        { value: 'today', label: 'Today' },
        { value: 'last1', label: 'Last 1 Day' },
        { value: 'last7', label: 'Last 7 Days' },
        { value: 'last30', label: 'Last 30 Days' },
        { value: 'custom', label: 'Custom Range' },
    ];

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={STYLES.overlay}
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        style={STYLES.modal}
                    >
                        {/* Header */}
                        <div style={STYLES.header}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <Settings size={20} color="#3b82f6" />
                                <h2 style={{
                                    margin: 0,
                                    fontSize: '1.1rem',
                                    fontWeight: 600,
                                    color: 'var(--text-main, #f1f5f9)',
                                }}>
                                    Yield Analyzer Settings
                                </h2>
                            </div>
                            {/* Close button with ESC hint */}
                            <button
                                onClick={onClose}
                                style={STYLES.closeButton}
                                aria-label="Close settings (ESC)"
                                title="Press ESC to close"
                            >
                                <span style={{
                                    fontSize: '0.6rem',
                                    opacity: 0.7,
                                    padding: '2px 4px',
                                    background: 'rgba(255,255,255,0.1)',
                                    borderRadius: 3,
                                }}>
                                    ESC
                                </span>
                                <X size={18} />
                            </button>
                        </div>


                        {/* ===================== TWO COLUMN LAYOUT ===================== */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                            {/* ===================== LEFT COLUMN ===================== */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                                {/* YIELD THRESHOLDS */}
                                <div style={STYLES.section}>
                                    <h3 style={STYLES.sectionTitle}>Yield Thresholds</h3>

                                    {/* Preview: Speedometer (center) + Yield (right) */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginBottom: 16,
                                    }}>
                                        <div style={{ flex: 1 }} />
                                        <Speedometer
                                            value={previewValue}
                                            size={80}
                                            strokeWidth={6}
                                            segments={previewSegments}
                                            label="Preview"
                                            hideValue
                                            showTicks
                                        />
                                        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{
                                                    fontSize: '0.55rem',
                                                    color: 'var(--text-dim, #94a3b8)',
                                                    textTransform: 'uppercase',
                                                }}>Yield</div>
                                                <div style={{
                                                    fontSize: '1.1rem',
                                                    fontWeight: 700,
                                                    color: yieldColor,
                                                }}>{previewValue}.0%</div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Threshold Sliders */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        <div>
                                            <label style={{
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                marginBottom: 4, fontSize: '0.75rem',
                                                color: 'var(--text-dim, #94a3b8)',
                                            }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                                                Red Zone (0% - {redThreshold}%)
                                            </label>
                                            <input
                                                type="range" min={0} max={100} value={redThreshold}
                                                onChange={(e) => {
                                                    const val = Number(e.target.value);
                                                    const newRed = Math.min(99, Math.max(0, val));
                                                    setRedThreshold(newRed);
                                                    if (newRed >= yellowThreshold) setYellowThreshold(Math.min(100, newRed + 1));
                                                }}
                                                style={{ width: '100%', accentColor: '#ef4444' }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{
                                                display: 'flex', alignItems: 'center', gap: 6,
                                                marginBottom: 4, fontSize: '0.75rem',
                                                color: 'var(--text-dim, #94a3b8)',
                                            }}>
                                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
                                                Yellow Zone ({redThreshold}% - {yellowThreshold}%)
                                            </label>
                                            <input
                                                type="range" min={0} max={100} value={yellowThreshold}
                                                onChange={(e) => {
                                                    const val = Number(e.target.value);
                                                    const newYellow = Math.min(100, Math.max(1, val));
                                                    setYellowThreshold(newYellow);
                                                    if (newYellow <= redThreshold) setRedThreshold(Math.max(0, newYellow - 1));
                                                }}
                                                style={{ width: '100%', accentColor: '#f59e0b' }}
                                            />
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-dim, #94a3b8)' }}>
                                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                                            Green Zone ({yellowThreshold}% - 100%)
                                        </div>
                                    </div>
                                </div>

                                {/* DATE RANGE */}
                                <div style={STYLES.section}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                        <Calendar size={14} color="#3b82f6" />
                                        <h3 style={{ ...STYLES.sectionTitle, margin: 0 }}>Date Range</h3>
                                        <InfoTooltip text="Select the date range for yield calculation and historical data." />
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                                        {dateOptions.map((opt) => (
                                            <button
                                                key={opt.value}
                                                onClick={() => setDateMode(opt.value)}
                                                style={{
                                                    padding: '5px 10px',
                                                    borderRadius: 14,
                                                    border: dateMode === opt.value ? '2px solid #3b82f6' : '1px solid var(--border, rgba(255,255,255,0.2))',
                                                    background: dateMode === opt.value ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
                                                    color: dateMode === opt.value ? '#60a5fa' : 'var(--text-dim, #94a3b8)',
                                                    fontSize: '0.7rem',
                                                    fontWeight: 500,
                                                    cursor: 'pointer',
                                                }}
                                            >{opt.label}</button>
                                        ))}
                                    </div>
                                    {dateMode === 'custom' && (
                                        <div style={{ display: 'flex', gap: 10 }}>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: 3 }}>From</label>
                                                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
                                                    style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid var(--border, rgba(255,255,255,0.2))', background: 'var(--bg-card, #1e293b)', color: 'var(--text-main)', fontSize: '0.8rem' }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'block', marginBottom: 3 }}>To</label>
                                                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
                                                    style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid var(--border, rgba(255,255,255,0.2))', background: 'var(--bg-card, #1e293b)', color: 'var(--text-main)', fontSize: '0.8rem' }} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* ===================== RIGHT COLUMN ===================== */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                                {/* SHIFT CONFIGURATION */}
                                <div style={STYLES.section}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                        <Clock size={14} color="#3b82f6" />
                                        <h3 style={{ ...STYLES.sectionTitle, margin: 0 }}>Shift Configuration</h3>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: '0.75rem', color: 'var(--text-dim, #94a3b8)' }}>
                                                ☀️ Day Shift Start
                                            </label>
                                            <input
                                                type="time"
                                                value={dayShiftStart}
                                                onChange={(e) => setDayShiftStart(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px 12px',
                                                    borderRadius: 6,
                                                    border: '1px solid var(--border, rgba(255,255,255,0.2))',
                                                    background: 'var(--bg-card, #1e293b)',
                                                    color: 'var(--text-main, #f1f5f9)',
                                                    fontSize: '0.85rem',
                                                }}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: '0.75rem', color: 'var(--text-dim, #94a3b8)' }}>
                                                🌙 Night Shift Start
                                            </label>
                                            <input
                                                type="time"
                                                value={nightShiftStart}
                                                onChange={(e) => setNightShiftStart(e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: '8px 12px',
                                                    borderRadius: 6,
                                                    border: '1px solid var(--border, rgba(255,255,255,0.2))',
                                                    background: 'var(--bg-card, #1e293b)',
                                                    color: 'var(--text-main, #f1f5f9)',
                                                    fontSize: '0.85rem',
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* ALERT SETTINGS */}
                                <div style={STYLES.section}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                        <Bell size={14} color="#f59e0b" />
                                        <h3 style={{ ...STYLES.sectionTitle, margin: 0 }}>Alert Settings</h3>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        <div>
                                            <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.75rem', color: 'var(--text-dim, #94a3b8)' }}>
                                                <span>⚠️ Alert Threshold</span>
                                                <span style={{ color: '#ef4444', fontWeight: 600 }}>{alertThreshold}%</span>
                                            </label>
                                            <input
                                                type="range"
                                                min={50}
                                                max={99}
                                                value={alertThreshold}
                                                onChange={(e) => setAlertThreshold(Number(e.target.value))}
                                                style={{ width: '100%', accentColor: '#ef4444' }}
                                            />
                                            <div style={{ fontSize: '0.65rem', color: 'var(--text-dim)', marginTop: 4 }}>
                                                Alert when yield drops below this value
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 12 }}>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                                    ⏱️ Cooldown (min)
                                                    <InfoTooltip text="Minimum time (in minutes) between consecutive alerts for the same machine." />
                                                </label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={1440}
                                                    value={cooldownMinutes}
                                                    onChange={(e) => setCooldownMinutes(Math.max(1, Number(e.target.value)))}
                                                    style={{
                                                        width: '100%',
                                                        padding: '6px 10px',
                                                        borderRadius: 6,
                                                        border: '1px solid var(--border, rgba(255,255,255,0.2))',
                                                        background: 'var(--bg-card, #1e293b)',
                                                        color: 'var(--text-main, #f1f5f9)',
                                                        fontSize: '0.85rem',
                                                    }}
                                                />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: '0.7rem', color: 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                                                    📅 History (days)
                                                    <InfoTooltip text="Number of days to keep alert history in the database." />
                                                </label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={365}
                                                    value={historyDays}
                                                    onChange={(e) => setHistoryDays(Math.max(1, Number(e.target.value)))}
                                                    style={{
                                                        width: '100%',
                                                        padding: '6px 10px',
                                                        borderRadius: 6,
                                                        border: '1px solid var(--border, rgba(255,255,255,0.2))',
                                                        background: 'var(--bg-card, #1e293b)',
                                                        color: 'var(--text-main, #f1f5f9)',
                                                        fontSize: '0.85rem',
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>


                        {/* ===================== ACTIONS ===================== */}
                        <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            paddingTop: 12,
                            borderTop: '1px solid var(--border, rgba(255,255,255,0.1))',
                        }}>
                            <button
                                onClick={handleReset}
                                style={{
                                    background: 'transparent',
                                    border: '1px solid var(--border, rgba(255,255,255,0.2))',
                                    color: 'var(--text-dim, #94a3b8)',
                                    padding: '8px 16px',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                }}
                            >
                                Reset to Defaults
                            </button>
                            <button
                                onClick={handleSave}
                                style={{
                                    background: 'linear-gradient(135deg, #3b82f6, #10b981)',
                                    border: 'none',
                                    color: '#ffffff',
                                    padding: '8px 20px',
                                    borderRadius: 6,
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
                                    fontWeight: 600,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                }}
                            >
                                <Save size={16} />
                                Save Settings
                            </button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

const InfoTooltip: React.FC<{ text: string }> = ({ text }) => {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <div
            style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
            onMouseEnter={() => setIsVisible(true)}
            onMouseLeave={() => setIsVisible(false)}
        >
            <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <Info size={12} color="var(--text-dim)" />
            </div>
            <AnimatePresence>
                {isVisible && (
                    <motion.div
                        initial={{ opacity: 0, x: -5, scale: 0.95 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, x: -5, scale: 0.95 }}
                        transition={{ duration: 0.1 }}
                        style={{
                            position: 'absolute',
                            left: '100%',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            marginLeft: 10,
                            background: 'rgba(15, 23, 42, 0.95)',
                            border: '1px solid var(--border, #334155)',
                            borderRadius: 6,
                            padding: '6px 10px',
                            fontSize: '0.75rem',
                            color: '#f8fafc',
                            whiteSpace: 'nowrap',
                            zIndex: 50,
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                            pointerEvents: 'none',
                        }}
                    >
                        {text}
                        {/* Arrow */}
                        <div style={{
                            position: 'absolute',
                            left: -4,
                            top: '50%',
                            marginTop: -4,
                            borderTop: '4px solid transparent',
                            borderBottom: '4px solid transparent',
                            borderRight: '4px solid rgba(15, 23, 42, 0.95)',
                        }} />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default SettingsModal;
