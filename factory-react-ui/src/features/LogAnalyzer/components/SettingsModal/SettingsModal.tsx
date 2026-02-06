/**
 * SettingsModal - Global Log Analyzer Settings
 *
 * Features:
 * - Yield threshold configuration with live preview
 * - Date range selection for yield history
 * - ESC key to close
 * - Modern React patterns (Hooks, useCallback)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings, Save, Calendar } from 'lucide-react';
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
        width: 460,
        maxWidth: '90vw',
        maxHeight: '90vh',
        overflow: 'auto',
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

    // Local state for editing
    const [redThreshold, setRedThreshold] = useState(settings.redThreshold);
    const [yellowThreshold, setYellowThreshold] = useState(settings.yellowThreshold);
    const [dateMode, setDateMode] = useState<DateRangeMode>(settings.dateRange.mode);
    const [customFrom, setCustomFrom] = useState(settings.dateRange.customFrom || '');
    const [customTo, setCustomTo] = useState(settings.dateRange.customTo || '');

    // Sync local state when settings change
    useEffect(() => {
        setRedThreshold(settings.redThreshold);
        setYellowThreshold(settings.yellowThreshold);
        setDateMode(settings.dateRange.mode);
        setCustomFrom(settings.dateRange.customFrom || '');
        setCustomTo(settings.dateRange.customTo || '');
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
        });
        onClose();
    }, [redThreshold, yellowThreshold, dateMode, customFrom, customTo, updateSettings, onClose]);

    const handleReset = useCallback(() => {
        setRedThreshold(85);
        setYellowThreshold(95);
        setDateMode('today');
        setCustomFrom('');
        setCustomTo('');
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

                        {/* ===================== YIELD THRESHOLDS ===================== */}
                        <div style={STYLES.section}>
                            <h3 style={STYLES.sectionTitle}>Yield Thresholds</h3>

                            {/* Preview: Speedometer (center) + Yield (right) */}
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginBottom: 16,
                            }}>
                                {/* Spacer for centering */}
                                <div style={{ flex: 1 }} />

                                {/* Speedometer - centered */}
                                <Speedometer
                                    value={previewValue}
                                    size={100}
                                    strokeWidth={8}
                                    segments={previewSegments}
                                    label="Preview"
                                    hideValue
                                    showTicks
                                />

                                {/* Yield value - right side */}
                                <div style={{
                                    flex: 1,
                                    display: 'flex',
                                    justifyContent: 'center',
                                }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{
                                            fontSize: '0.6rem',
                                            color: 'var(--text-dim, #94a3b8)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.03em',
                                        }}>
                                            Yield
                                        </div>
                                        <div style={{
                                            fontSize: '1.3rem',
                                            fontWeight: 700,
                                            color: yieldColor,
                                            lineHeight: 1,
                                        }}>
                                            {previewValue}.0%
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Threshold Sliders */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                {/* Red Threshold */}
                                <div>
                                    <label style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        marginBottom: 4, fontSize: '0.8rem',
                                        color: 'var(--text-dim, #94a3b8)',
                                    }}>
                                        <span style={{
                                            width: 10, height: 10, borderRadius: '50%',
                                            background: '#ef4444',
                                        }} />
                                        Red Zone (0% - {redThreshold}%)
                                    </label>
                                    <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        value={redThreshold}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            // Clamp Red: 0 to 99 (must leave room for Yellow)
                                            const newRed = Math.min(99, Math.max(0, val));
                                            setRedThreshold(newRed);
                                            // Push Yellow if overlap
                                            if (newRed >= yellowThreshold) {
                                                setYellowThreshold(Math.min(100, newRed + 1));
                                            }
                                        }}
                                        style={{ width: '100%', accentColor: '#ef4444' }}
                                    />
                                </div>

                                {/* Yellow Threshold */}
                                <div>
                                    <label style={{
                                        display: 'flex', alignItems: 'center', gap: 8,
                                        marginBottom: 4, fontSize: '0.8rem',
                                        color: 'var(--text-dim, #94a3b8)',
                                    }}>
                                        <span style={{
                                            width: 10, height: 10, borderRadius: '50%',
                                            background: '#f59e0b',
                                        }} />
                                        Yellow Zone ({redThreshold}% - {yellowThreshold}%)
                                    </label>
                                    <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        value={yellowThreshold}
                                        onChange={(e) => {
                                            const val = Number(e.target.value);
                                            // Clamp Yellow: 1 to 100 (must leave room for Red)
                                            const newYellow = Math.min(100, Math.max(1, val));
                                            setYellowThreshold(newYellow);
                                            // Push Red if overlap
                                            if (newYellow <= redThreshold) {
                                                setRedThreshold(Math.max(0, newYellow - 1));
                                            }
                                        }}
                                        style={{ width: '100%', accentColor: '#f59e0b' }}
                                    />
                                </div>

                                {/* Green Zone Info */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: 8,
                                    fontSize: '0.8rem', color: 'var(--text-dim, #94a3b8)',
                                }}>
                                    <span style={{
                                        width: 10, height: 10, borderRadius: '50%',
                                        background: '#22c55e',
                                    }} />
                                    Green Zone ({yellowThreshold}% - 100%)
                                </div>
                            </div>
                        </div>

                        {/* ===================== DATE RANGE ===================== */}
                        <div style={STYLES.section}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <Calendar size={16} color="#3b82f6" />
                                <h3 style={{ ...STYLES.sectionTitle, margin: 0 }}>
                                    Yield History Date Range
                                </h3>
                            </div>

                            {/* Date Mode Buttons */}
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                                {dateOptions.map((opt) => (
                                    <button
                                        key={opt.value}
                                        onClick={() => setDateMode(opt.value)}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: 16,
                                            border: dateMode === opt.value
                                                ? '2px solid #3b82f6'
                                                : '1px solid var(--border, rgba(255,255,255,0.2))',
                                            background: dateMode === opt.value
                                                ? 'rgba(59, 130, 246, 0.2)'
                                                : 'transparent',
                                            color: dateMode === opt.value
                                                ? '#60a5fa'
                                                : 'var(--text-dim, #94a3b8)',
                                            fontSize: '0.75rem',
                                            fontWeight: 500,
                                            cursor: 'pointer',
                                            transition: 'all 0.2s',
                                        }}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>

                            {/* Custom Date Inputs */}
                            {dateMode === 'custom' && (
                                <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{
                                            fontSize: '0.75rem',
                                            color: 'var(--text-dim, #94a3b8)',
                                            marginBottom: 4,
                                            display: 'block',
                                        }}>
                                            From
                                        </label>
                                        <input
                                            type="date"
                                            value={customFrom}
                                            onChange={(e) => setCustomFrom(e.target.value)}
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
                                        <label style={{
                                            fontSize: '0.75rem',
                                            color: 'var(--text-dim, #94a3b8)',
                                            marginBottom: 4,
                                            display: 'block',
                                        }}>
                                            To
                                        </label>
                                        <input
                                            type="date"
                                            value={customTo}
                                            onChange={(e) => setCustomTo(e.target.value)}
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
                            )}
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

export default SettingsModal;
