import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Search, Timer, BarChart3, Clock } from 'lucide-react';
import { useLogAnalyzerLocalSettings } from '../../features/LogAnalyzer/context/LogAnalyzerLocalSettingsContext';

interface Props {
    isOpen: boolean;
    onClose: () => void;
    /** Operation names discovered from current analysis */
    operationNames: string[];
}

export default function LogAnalyzerSettingsModal({ isOpen, onClose, operationNames }: Props) {
    const { settings, updateSettings, registerOperationNames } = useLogAnalyzerLocalSettings();

    // Local state for editing
    const [idealTimes, setIdealTimes] = useState<Record<string, number>>({});
    const [defaultIdealMs, setDefaultIdealMs] = useState(1000);
    const [idealBarrelTimeMs, setIdealBarrelTimeMs] = useState(8500);
    const [idealTrayTimeMs, setIdealTrayTimeMs] = useState(60000);
    const [filter, setFilter] = useState('');

    // Sync from context on open
    useEffect(() => {
        if (isOpen) {
            // Register any new operation names
            if (operationNames.length > 0) {
                registerOperationNames(operationNames);
            }
            setIdealTimes({ ...settings.idealTimes });
            setDefaultIdealMs(settings.defaultIdealMs);
            setIdealBarrelTimeMs(settings.idealBarrelTimeMs);
            setIdealTrayTimeMs(settings.idealTrayTimeMs);
        }
    }, [isOpen, settings, operationNames, registerOperationNames]);

    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    const filteredOps = useMemo(() => {
        const allOps = Object.keys(idealTimes).sort();
        if (!filter) return allOps;
        const lowerFilter = filter.toLowerCase();
        return allOps.filter(op => op.toLowerCase().includes(lowerFilter));
    }, [idealTimes, filter]);

    const handleSave = useCallback(() => {
        updateSettings({
            idealTimes,
            defaultIdealMs,
            idealBarrelTimeMs,
            idealTrayTimeMs,
        });
        onClose();
    }, [idealTimes, defaultIdealMs, idealBarrelTimeMs, idealTrayTimeMs, updateSettings, onClose]);

    const handleOpChange = (opName: string, value: number) => {
        setIdealTimes(prev => ({ ...prev, [opName]: value }));
    };

    const handleReset = () => {
        setDefaultIdealMs(1000);
        setIdealBarrelTimeMs(8500);
        setIdealTrayTimeMs(60000);
        // Reset all per-op to default
        const reset: Record<string, number> = {};
        for (const key of Object.keys(idealTimes)) {
            reset[key] = 1000;
        }
        setIdealTimes(reset);
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                style={{
                    position: 'fixed', inset: 0,
                    background: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 1100,
                }}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                        background: 'var(--bg-card, #1e293b)',
                        borderRadius: 12,
                        padding: 24,
                        width: 550,
                        maxWidth: '95vw',
                        maxHeight: '85vh',
                        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}
                >
                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Timer size={20} color="#f59e0b" />
                            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 600, color: '#f1f5f9' }}>
                                Log Analyzer Settings
                            </h2>
                        </div>
                        <button onClick={onClose} style={{
                            display: 'flex', alignItems: 'center', gap: 4,
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            padding: '4px 8px', borderRadius: 4, color: '#94a3b8', fontSize: '0.7rem',
                        }}>
                            <span style={{ fontSize: '0.6rem', opacity: 0.7, padding: '2px 4px', background: 'rgba(255,255,255,0.1)', borderRadius: 3 }}>ESC</span>
                            <X size={18} />
                        </button>
                    </div>

                    {/* Scrollable content */}
                    <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
                        {/* Global thresholds */}
                        <div style={sectionStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                <BarChart3 size={14} color="#3b82f6" />
                                <h3 style={sectionTitleStyle}>Chart Thresholds</h3>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                                <NumberField
                                    label="Default Ideal (ms)"
                                    value={defaultIdealMs}
                                    onChange={setDefaultIdealMs}
                                    hint="Fallback when log doesn't specify"
                                />
                                <NumberField
                                    label="Barrel Ideal (ms)"
                                    value={idealBarrelTimeMs}
                                    onChange={setIdealBarrelTimeMs}
                                    hint="Green/red threshold for barrels"
                                />
                                <NumberField
                                    label="Tray Ideal (ms)"
                                    value={idealTrayTimeMs}
                                    onChange={setIdealTrayTimeMs}
                                    hint="Green/red threshold for trays"
                                />
                            </div>
                        </div>

                        {/* Per-operation ideal times */}
                        <div style={sectionStyle}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <Clock size={14} color="#f59e0b" />
                                    <h3 style={sectionTitleStyle}>Per-Operation Ideal Times</h3>
                                </div>
                                <span style={{ fontSize: '0.65rem', color: '#64748b' }}>
                                    {filteredOps.length} / {Object.keys(idealTimes).length} operations
                                </span>
                            </div>

                            {/* Filter */}
                            <div style={{ position: 'relative', marginBottom: 10 }}>
                                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
                                <input
                                    type="text"
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                    placeholder="Filter operations..."
                                    style={{
                                        width: '100%', padding: '6px 10px 6px 32px',
                                        borderRadius: 6, border: '1px solid #334155',
                                        background: 'rgba(15, 23, 42, 0.5)', color: '#f1f5f9',
                                        fontSize: '0.8rem', outline: 'none',
                                    }}
                                />
                            </div>

                            {/* Operations list */}
                            <div style={{ maxHeight: 220, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {filteredOps.length === 0 ? (
                                    <div style={{ padding: 16, textAlign: 'center', color: '#475569', fontSize: '0.8rem' }}>
                                        {Object.keys(idealTimes).length === 0
                                            ? 'Analyze a log file to discover operations'
                                            : 'No operations match the filter'
                                        }
                                    </div>
                                ) : (
                                    filteredOps.map(opName => (
                                        <div key={opName} style={{
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            padding: '4px 8px', borderRadius: 4,
                                            background: 'rgba(15, 23, 42, 0.3)',
                                        }}>
                                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                {opName.replace('Sequence_', '')}
                                            </span>
                                            <input
                                                type="number"
                                                min={0}
                                                value={idealTimes[opName] ?? defaultIdealMs}
                                                onChange={(e) => handleOpChange(opName, Math.max(0, Number(e.target.value)))}
                                                style={{
                                                    width: 80, padding: '3px 6px', borderRadius: 4,
                                                    border: '1px solid #334155',
                                                    background: 'rgba(15, 23, 42, 0.8)', color: '#fbbf24',
                                                    fontSize: '0.75rem', textAlign: 'right',
                                                }}
                                            />
                                            <span style={{ fontSize: '0.6rem', color: '#64748b', marginLeft: 4 }}>ms</span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{
                        display: 'flex', justifyContent: 'space-between', paddingTop: 12,
                        borderTop: '1px solid rgba(255,255,255,0.1)', flexShrink: 0, marginTop: 8,
                    }}>
                        <button onClick={handleReset} style={{
                            background: 'transparent', border: '1px solid #334155',
                            color: '#94a3b8', padding: '8px 16px', borderRadius: 6,
                            cursor: 'pointer', fontSize: '0.8rem',
                        }}>
                            Reset to Defaults
                        </button>
                        <button onClick={handleSave} style={{
                            background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                            border: 'none', color: '#fff', padding: '8px 20px',
                            borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem',
                            fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                            <Save size={14} /> Save
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function NumberField({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
    return (
        <div>
            <label style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                {label}
            </label>
            <input
                type="number"
                min={0}
                value={value}
                onChange={(e) => onChange(Math.max(0, Number(e.target.value)))}
                style={{
                    width: '100%', padding: '6px 10px', borderRadius: 6,
                    border: '1px solid #334155',
                    background: 'rgba(15, 23, 42, 0.5)', color: '#f1f5f9',
                    fontSize: '0.85rem',
                }}
            />
            {hint && <div style={{ fontSize: '0.6rem', color: '#475569', marginTop: 2 }}>{hint}</div>}
        </div>
    );
}

const sectionStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 16,
};

const sectionTitleStyle: React.CSSProperties = {
    margin: 0,
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#f1f5f9',
};
