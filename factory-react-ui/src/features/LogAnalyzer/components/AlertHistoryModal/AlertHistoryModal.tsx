import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, CheckCircle, Trash2, MailOpen, EyeOff } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertService, type YieldAlert } from '../../../../services/AlertService';
import { useLogAnalyzerSettingsSafe } from '../../context/LogAnalyzerSettingsContext';

interface AlertHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const STYLES = {
    overlay: {
        position: 'fixed' as const,
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
    },
    modal: {
        background: 'var(--bg-card, #1e293b)',
        border: '1px solid var(--border, #334155)',
        borderRadius: 12,
        width: '90%',
        maxWidth: 800,
        height: '80vh',
        display: 'flex',
        flexDirection: 'column' as const,
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
        overflow: 'hidden',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid var(--border, #334155)',
        background: 'rgba(30, 41, 59, 0.5)',
    },
    content: {
        flex: 1,
        overflowY: 'auto' as const,
        padding: 0,
    },
    row: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1.5fr 1fr 1fr 1fr 1fr',
        gap: 12,
        padding: '12px 20px',
        borderBottom: '1px solid var(--border, #334155)',
        alignItems: 'center',
        fontSize: '0.9rem',
        color: 'var(--text-main, #e2e8f0)',
    },
    headerRow: {
        background: 'rgba(0,0,0,0.2)',
        fontWeight: 600,
        fontSize: '0.8rem',
        color: 'var(--text-dim, #94a3b8)',
        letterSpacing: '0.05em',
        textTransform: 'uppercase' as const,
    },
    badge: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '4px 8px',
        borderRadius: 999,
        fontSize: '0.75rem',
        fontWeight: 600,
    }
};

export const AlertHistoryModal: React.FC<AlertHistoryModalProps> = ({ isOpen, onClose }) => {
    const [alerts, setAlerts] = useState<YieldAlert[]>([]);
    const [loading, setLoading] = useState(false);

    const { settings } = useLogAnalyzerSettingsSafe();
    const historyDays = settings.alertConfig.historyDays;

    const loadAlerts = () => {
        setLoading(true);
        AlertService.getHistory(historyDays)
            .then(setAlerts)
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (isOpen) {
            loadAlerts();
        }
    }, [isOpen]);

    
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [onClose]);

    const handleClearAll = async () => {
        if (window.confirm('Are you sure you want to permanently delete ALL alerts?')) {
            try {
                await AlertService.clearAll();
                setAlerts([]);
            } catch (error) {
                console.error('Failed to clear alerts', error);
                alert('Failed to clear alerts');
            }
        }
    };

    const handleDelete = async (id: number) => {
        if (window.confirm('Delete this alert permanently?')) {
            try {
                await AlertService.delete(id);
                setAlerts(prev => prev.filter(a => a.id !== id));
            } catch (error) {
                console.error('Failed to delete alert', error);
            }
        }
    };

    if (!isOpen) return null;

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
                    initial={{ scale: 0.95, opacity: 0, y: 20 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0.95, opacity: 0, y: 20 }}
                    style={STYLES.modal}
                    onClick={e => e.stopPropagation()}
                >
                    {}
                    <div style={STYLES.header}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ padding: 8, borderRadius: 8, background: 'rgba(239, 68, 68, 0.15)' }}>
                                <AlertTriangle size={20} className="text-red-500" />
                            </div>
                            <div>
                                <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--text-main)' }}>
                                    Yield Alert History
                                </h2>
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', margin: 0 }}>
                                    Past {historyDays} days
                                </p>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {alerts.length > 0 && (
                                <button
                                    onClick={handleClearAll}
                                    style={{
                                        background: 'rgba(239, 68, 68, 0.1)',
                                        border: '1px solid rgba(239, 68, 68, 0.3)',
                                        color: '#ef4444',
                                        cursor: 'pointer',
                                        padding: '6px 12px',
                                        borderRadius: 6,
                                        fontSize: '0.8rem',
                                        fontWeight: 600
                                    }}
                                >
                                    Clear All
                                </button>
                            )}
                            <button
                                onClick={onClose}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-dim)',
                                    cursor: 'pointer',
                                    padding: 8,
                                    borderRadius: 6,
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    fontSize: '0.8rem'
                                }}
                            >
                                ESC <X size={18} />
                            </button>
                        </div>
                    </div>

                    {}
                    <div style={{ ...STYLES.row, ...STYLES.headerRow }}>
                        <div>Date</div>
                        <div>Range</div>
                        <div>Machine</div>
                        <div>Line</div>
                        <div>Yield</div>
                        <div>Status</div>
                        <div>Action</div>
                    </div>

                    {}
                    <div style={STYLES.content}>
                        {loading ? (
                            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
                                Loading history...
                            </div>
                        ) : alerts.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-dim)' }}>
                                No alerts found in the last {historyDays} days.
                            </div>
                        ) : (
                            alerts
                                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                                .map(alert => {
                                    const isResolved = !alert.isActive; 
                                    const isAcknowledged = alert.isAcknowledged;
                                    const date = new Date(alert.createdAt).toLocaleString();

                                    return (
                                        <div key={alert.id} style={STYLES.row}>
                                            <div style={{ fontSize: '0.85rem', color: 'var(--text-dim)' }}>
                                                {date}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)' }}>
                                                {alert.dateRangeStart ? (
                                                    <>
                                                        {new Date(alert.dateRangeStart).toLocaleDateString()}
                                                        <br />
                                                        <span style={{ fontSize: '0.75em' }}>to</span> {new Date(alert.dateRangeEnd || '').toLocaleDateString()}
                                                    </>
                                                ) : (
                                                    <span style={{ fontStyle: 'italic' }}>-</span>
                                                )}
                                            </div>
                                            <div style={{ fontWeight: 500 }}>
                                                {alert.machineName}
                                            </div>
                                            <div>
                                                Line {alert.lineNumber}
                                            </div>
                                            <div style={{
                                                color: alert.currentYield < 85 ? '#ef4444' : '#f59e0b',
                                                fontWeight: 600
                                            }}>
                                                {alert.currentYield.toFixed(1)}%
                                                <span style={{ fontSize: '0.7em', color: 'var(--text-dim)', fontWeight: 400, marginLeft: 4 }}>
                                                    / {alert.threshold}%
                                                </span>
                                            </div>
                                            <div>
                                                {isResolved ? (
                                                    <span style={{ ...STYLES.badge, background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e' }}>
                                                        <CheckCircle size={12} /> Recovered
                                                    </span>
                                                ) : isAcknowledged ? (
                                                    <span style={{ ...STYLES.badge, background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6' }}>
                                                        <MailOpen size={12} /> Seen
                                                    </span>
                                                ) : (
                                                    <span style={{ ...STYLES.badge, background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444' }}>
                                                        <AlertTriangle size={12} /> Active
                                                    </span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-dim)', display: 'flex', gap: 8 }}>
                                                {!isResolved && !isAcknowledged && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            AlertService.acknowledge(alert.id)
                                                                .then(() => {
                                                                    setAlerts(prev => prev.map(a =>
                                                                        a.id === alert.id ? { ...a, isAcknowledged: true, acknowledgedAt: new Date().toISOString() } : a
                                                                    ));
                                                                });
                                                        }}
                                                        title="Mark as Read"
                                                        style={{
                                                            background: 'transparent',
                                                            border: '1px solid var(--border)',
                                                            borderRadius: 4,
                                                            color: 'var(--text-dim)',
                                                            padding: 6,
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <MailOpen size={14} />
                                                    </button>
                                                )}
                                                {!isResolved && isAcknowledged && (
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            AlertService.unacknowledge(alert.id)
                                                                .then(() => {
                                                                    setAlerts(prev => prev.map(a =>
                                                                        a.id === alert.id ? { ...a, isAcknowledged: false, acknowledgedAt: undefined } : a
                                                                    ));
                                                                });
                                                        }}
                                                        title="Mark as Unseen"
                                                        style={{
                                                            background: 'rgba(245, 158, 11, 0.1)',
                                                            border: '1px solid rgba(245, 158, 11, 0.3)',
                                                            borderRadius: 4,
                                                            color: '#f59e0b',
                                                            padding: 6,
                                                            cursor: 'pointer',
                                                        }}
                                                    >
                                                        <EyeOff size={14} />
                                                    </button>
                                                )}
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDelete(alert.id);
                                                    }}
                                                    title="Delete Alert"
                                                    style={{
                                                        background: 'rgba(239, 68, 68, 0.1)',
                                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                                        borderRadius: 4,
                                                        color: '#ef4444',
                                                        padding: 6,
                                                        cursor: 'pointer',
                                                    }}
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};
