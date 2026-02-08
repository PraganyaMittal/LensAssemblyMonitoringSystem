import React, { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X } from 'lucide-react';
import { useAlerts } from '../../context';
import { YieldAlert } from '../../../../services/AlertService';

export const YieldAlertToast: React.FC = () => {
    const { alerts, acknowledgeAlert } = useAlerts();
    // Only show unacknowledged alerts that were created recently (last 10 seconds)
    // Or just show the latest one if it's new?
    // For simplicity, let's just show the latest active alert if it appeared in the last 10 seconds.
    // However, `alerts` state doesn't track "viewed" status locally.
    // A better approach for Toast is to listen to the Event, but Context handles events.
    // We can filter `alerts` by `createdAt` vs `now`.

    // Actually, let's just show the most recent alert if it's active.
    // But we don't want it to stick around forever in Toast (Banner does that).
    // Toast should auto-dismiss.

    // Let's defer Toast logic adjustment. For now, just a simple component that renders nothing 
    // because maintaining "toast state" requires a separate state in Context or here.
    // Given the Banner exists and is prominent, maybe Toast is redundant/annoying if not implemented carefully with a queue.

    // I'll implement a simple version that shows the LATEST alert if it is < 10 seconds old.

    const [recentAlert, setRecentAlert] = React.useState<YieldAlert | null>(null);

    useEffect(() => {
        if (alerts.length > 0) {
            const latest = alerts[0]; // Alerts are prepended
            const diff = new Date().getTime() - new Date(latest.createdAt).getTime();
            if (diff < 10000) { // 10 seconds
                setRecentAlert(latest);
                const timer = setTimeout(() => setRecentAlert(null), 10000);
                return () => clearTimeout(timer);
            }
        }
    }, [alerts]);

    if (!recentAlert) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, y: 50, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                className="fixed bottom-6 right-6 z-50 bg-white border-l-4 border-red-500 shadow-2xl rounded-md p-4 max-w-sm flex items-start gap-3"
            >
                <div className="bg-red-100 p-2 rounded-full text-red-600">
                    <AlertTriangle size={20} />
                </div>
                <div className="flex-1">
                    <h4 className="font-bold text-gray-800 text-sm">Low Yield Warning</h4>
                    <p className="text-xs text-gray-600 mt-1">
                        {recentAlert.machineName} (Line {recentAlert.lineNumber}) dropped to <span className="font-bold text-red-600">{recentAlert.currentYield.toFixed(1)}%</span>.
                    </p>
                </div>
                <button
                    onClick={() => {
                        if (recentAlert) acknowledgeAlert(recentAlert.id);
                        setRecentAlert(null);
                    }}
                    className="text-gray-400 hover:text-gray-800"
                >
                    <X size={16} />
                </button>
            </motion.div>
        </AnimatePresence>
    );
};
