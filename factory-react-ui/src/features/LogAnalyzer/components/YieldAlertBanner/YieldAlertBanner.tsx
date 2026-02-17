import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAlerts } from '../../context';

export const YieldAlertBanner: React.FC = () => {
    const { alerts, acknowledgeAlert } = useAlerts();

    if (alerts.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 mb-4 w-full">
            <AnimatePresence>
                {alerts.map(alert => (
                    <motion.div
                        key={alert.id}
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg flex items-center justify-between"
                    >
                        <div className="flex items-center gap-3">
                            <AlertTriangle className="text-white" size={20} />
                            <span className="font-medium">
                                <strong>LOW YIELD ALERT:</strong> {alert.machineName || `MC-${alert.machineId}`} (Line {alert.lineNumber}) is at
                                <span className="font-bold text-yellow-300 ml-1">{alert.currentYield.toFixed(1)}%</span>
                                (Below {alert.threshold}%)
                            </span>
                        </div>
                        <button
                            onClick={() => acknowledgeAlert(alert.id)}
                            className="text-white/80 hover:text-white hover:bg-white/10 p-1 rounded transition-colors"
                            title="Acknowledge & Dismiss"
                        >
                            <X size={20} />
                        </button>
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};
