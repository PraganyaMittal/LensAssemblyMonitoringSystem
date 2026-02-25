import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AlertService, YieldAlert } from '../../../services/AlertService';
import { useSignalR } from './SignalRContext';

interface AlertContextValue {
    alerts: YieldAlert[];
    acknowledgeAlert: (id: number) => Promise<void>;
    isConnected: boolean; // Keep for backwards compatibility
}

const AlertContext = createContext<AlertContextValue | null>(null);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [alerts, setAlerts] = useState<YieldAlert[]>([]);
    const { connection, isConnected } = useSignalR();

    // Fetch initial active alerts
    useEffect(() => {
        AlertService.getActiveAlerts().then(setAlerts).catch(console.error);
    }, []);

    // Subscribe to SignalR events when connection is available
    useEffect(() => {
        if (!connection) return;

        let mounted = true;

        const handleReceiveAlert = (alert: YieldAlert) => {
            if (!mounted) return;
            setAlerts(prev => {
                if (prev.find(a => a.id === alert.id)) return prev;
                return [alert, ...prev];
            });
        };

        const handleResolveAlert = (id: number) => {
            if (mounted) setAlerts(prev => prev.filter(a => a.id !== id));
        };

        const handleAcknowledgeAlert = (id: number) => {
            if (mounted) setAlerts(prev => prev.map(a =>
                a.id === id ? { ...a, isAcknowledged: true, acknowledgedAt: new Date().toISOString() } : a
            ));
        };

        const handleDeleteAlert = (id: number) => {
            if (mounted) setAlerts(prev => prev.filter(a => a.id !== id));
        };

        const handleClearAllAlerts = () => {
            if (mounted) setAlerts([]);
        };

        connection.on('ReceiveAlert', handleReceiveAlert);
        connection.on('ResolveAlert', handleResolveAlert);
        connection.on('AcknowledgeAlert', handleAcknowledgeAlert);
        connection.on('DeleteAlert', handleDeleteAlert);
        connection.on('ClearAllAlerts', handleClearAllAlerts);

        return () => {
            mounted = false;
            // Clean up listeners when connection changes or unmounts
            connection.off('ReceiveAlert', handleReceiveAlert);
            connection.off('ResolveAlert', handleResolveAlert);
            connection.off('AcknowledgeAlert', handleAcknowledgeAlert);
            connection.off('DeleteAlert', handleDeleteAlert);
            connection.off('ClearAllAlerts', handleClearAllAlerts);
        };
    }, [connection]);

    const acknowledgeAlert = async (id: number) => {
        // Optimistic update: Mark as acknowledged, don't remove
        setAlerts(prev => prev.map(a =>
            a.id === id ? { ...a, isAcknowledged: true, acknowledgedAt: new Date().toISOString() } : a
        ));
        try {
            await AlertService.acknowledge(id);
        } catch (e: unknown) {
            console.error("Failed to acknowledge", e);
            // Re-fetch to be safe
            AlertService.getActiveAlerts().then(setAlerts);
        }
    };

    return (
        <AlertContext.Provider value={{ alerts, acknowledgeAlert, isConnected }}>
            {children}
        </AlertContext.Provider>
    );
};

export const useAlerts = () => {
    const context = useContext(AlertContext);
    if (!context) throw new Error("useAlerts must be used within AlertProvider");
    return context;
};
