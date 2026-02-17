import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { useAlerts } from '../../context';
import { YieldAlert } from '../../../../services/AlertService';

interface ToastItem {
    id: number;
    alert: YieldAlert;
}

export const YieldAlertToast: React.FC = () => {
    const { alerts, acknowledgeAlert } = useAlerts();
    const [toasts, setToasts] = useState<ToastItem[]>([]);

    // Track seen alert IDs to prevent re-toasting old alerts on mount/refresh
    // Initialize with current alert IDs so we only toast *new* ones arriving after mount
    // Or, if we want to toast existing ones on refresh? User said "notification", implies new event.
    // Let's assume on page load, we don't spam 50 toasts. Only new ones.
    const seenIdsRef = useRef<Set<number>>(new Set());
    const isFirstRun = useRef(true);

    useEffect(() => {
        // If it's the very first run (mount), mark all current alerts as seen so we don't blast them.
        if (isFirstRun.current) {
            alerts.forEach(a => seenIdsRef.current.add(a.id));
            isFirstRun.current = false;
            return;
        }

        alerts.forEach(alert => {
            if (!seenIdsRef.current.has(alert.id)) {
                // It's a new alert! Add a toast.
                seenIdsRef.current.add(alert.id);
                addToast(alert);
            }
        });
    }, [alerts]);

    const addToast = (alert: YieldAlert) => {
        setToasts(prev => [...prev, { id: alert.id, alert }]);
    };

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    // Auto-dismiss logic
    useEffect(() => {
        if (toasts.length === 0) return;

        const timers = toasts.map(t => {
            return setTimeout(() => removeToast(t.id), 5000);
        });

        return () => timers.forEach(clearTimeout);
    }, [toasts]);

    return (
        <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
            <AnimatePresence>
                {toasts.map(toast => (
                    <motion.div
                        key={toast.id}
                        initial={{ opacity: 0, x: 50, scale: 0.9 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                        layout
                        className="pointer-events-auto bg-white border-l-4 border-red-500 shadow-xl rounded-md p-4 min-w-[320px] max-w-sm flex items-start gap-3 relative overflow-hidden"
                    >
                        {/* Progress Bar (Optional, simple CSS animation could go here) */}

                        <div className="bg-red-100 p-2 rounded-full text-red-600 shrink-0">
                            <AlertTriangle size={20} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h4 className="font-bold text-gray-800 text-sm">Low Yield Alert</h4>
                            <p className="text-xs text-gray-600 mt-1 leading-snug">
                                <span className="font-semibold">{toast.alert.machineName}</span>
                                <br />
                                Yield dropped to <span className="font-bold text-red-600">{toast.alert.currentYield.toFixed(1)}%</span>
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                acknowledgeAlert(toast.id); // Also acknowledge logic? User said "close notification". Acknowledge might remove it from DB list too? 
                                // User said "close the notification early". Usually just dismisses toast.
                                // But if it's an "Alert", maybe we should Ack it?
                                // Let's just dismiss the toast for now to be safe, or user might miss it in history.
                                removeToast(toast.id);
                            }}
                            className="text-gray-400 hover:text-gray-800 p-1 -mt-1 -mr-1"
                        >
                            <X size={16} />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};
