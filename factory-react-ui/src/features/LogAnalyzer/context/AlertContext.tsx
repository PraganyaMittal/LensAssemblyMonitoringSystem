import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { AlertService, YieldAlert } from '../../../services/AlertService';
import { useSignalR } from './SignalRContext';

interface AlertContextValue {
    alerts: YieldAlert[];
    acknowledgeAlert: (id: number) => Promise<void>;
    unacknowledgeAlert: (id: number) => Promise<void>;
    isConnected: boolean; 
}

const AlertContext = createContext<AlertContextValue | null>(null);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [alerts, setAlerts] = useState<YieldAlert[]>([]);
    const { connection, isConnected } = useSignalR();

    
    useEffect(() => {
        AlertService.getActiveAlerts().then(setAlerts).catch(console.error);
    }, []);

    
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

        const handleUnacknowledgeAlert = (id: number) => {
            if (mounted) setAlerts(prev => prev.map(a =>
                a.id === id ? { ...a, isAcknowledged: false, acknowledgedAt: undefined } : a
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
        connection.on('UnacknowledgeAlert', handleUnacknowledgeAlert);
        connection.on('AcknowledgeAlert', handleAcknowledgeAlert);
        connection.on('DeleteAlert', handleDeleteAlert);
        connection.on('ClearAllAlerts', handleClearAllAlerts);

        return () => {
            mounted = false;
            
            connection.off('ReceiveAlert', handleReceiveAlert);
            connection.off('ResolveAlert', handleResolveAlert);
            connection.off('UnacknowledgeAlert', handleUnacknowledgeAlert);
            connection.off('AcknowledgeAlert', handleAcknowledgeAlert);
            connection.off('DeleteAlert', handleDeleteAlert);
            connection.off('ClearAllAlerts', handleClearAllAlerts);
        };
    }, [connection]);

    const acknowledgeAlert = async (id: number) => {
        
        setAlerts(prev => prev.map(a =>
            a.id === id ? { ...a, isAcknowledged: true, acknowledgedAt: new Date().toISOString() } : a
        ));
        try {
            await AlertService.acknowledge(id);
        } catch (e: unknown) {
            console.error("Failed to acknowledge", e);
            
            AlertService.getActiveAlerts().then(setAlerts);
        }
    };

    const unacknowledgeAlert = async (id: number) => {
        
        setAlerts(prev => prev.map(a =>
            a.id === id ? { ...a, isAcknowledged: false, acknowledgedAt: undefined } : a
        ));
        try {
            await AlertService.unacknowledge(id);
        } catch (e: unknown) {
            console.error("Failed to unacknowledge", e);
            AlertService.getActiveAlerts().then(setAlerts);
        }
    };

    return (
        <AlertContext.Provider value={{ alerts, acknowledgeAlert, unacknowledgeAlert, isConnected }}>
            {children}
        </AlertContext.Provider>
    );
};

export const useAlerts = () => {
    const context = useContext(AlertContext);
    if (!context) throw new Error("useAlerts must be used within AlertProvider");
    return context;
};
