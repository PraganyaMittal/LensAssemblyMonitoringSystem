import React, { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { HubConnectionBuilder, HubConnection, HubConnectionState, LogLevel } from '@microsoft/signalr';
import { AlertService, YieldAlert } from '../../../services/AlertService';

interface AlertContextValue {
    alerts: YieldAlert[];
    acknowledgeAlert: (id: number) => Promise<void>;
    isConnected: boolean;
}

const AlertContext = createContext<AlertContextValue | null>(null);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [alerts, setAlerts] = useState<YieldAlert[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const connectionRef = useRef<HubConnection | null>(null);

    // Fetch initial active alerts
    useEffect(() => {
        AlertService.getActiveAlerts().then(setAlerts).catch(console.error);
    }, []);

    // Single consolidated SignalR effect (StrictMode-safe)
    useEffect(() => {
        let mounted = true;

        const connection = new HubConnectionBuilder()
            .withUrl('/yieldHub')
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Warning)
            .build();

        connectionRef.current = connection;

        // Register ALL handlers BEFORE start() to avoid missing events
        connection.on('ReceiveAlert', (alert: YieldAlert) => {
            if (!mounted) return;
            setAlerts(prev => {
                if (prev.find(a => a.id === alert.id)) return prev;
                return [alert, ...prev];
            });
        });

        connection.on('ResolveAlert', (id: number) => {
            if (mounted) setAlerts(prev => prev.filter(a => a.id !== id));
        });

        connection.on('AcknowledgeAlert', (id: number) => {
            if (mounted) setAlerts(prev => prev.map(a =>
                a.id === id ? { ...a, isAcknowledged: true, acknowledgedAt: new Date().toISOString() } : a
            ));
        });

        connection.on('DeleteAlert', (id: number) => {
            if (mounted) setAlerts(prev => prev.filter(a => a.id !== id));
        });

        connection.on('ClearAllAlerts', () => {
            if (mounted) setAlerts([]);
        });

        connection.onreconnected(() => {
            console.log('[AlertContext] Reconnected to YieldHub');
            if (mounted) setIsConnected(true);
        });

        connection.onclose(() => {
            console.log('[AlertContext] Disconnected from YieldHub');
            if (mounted) setIsConnected(false);
        });

        connection.start()
            .then(() => {
                if (mounted) {
                    console.log('[AlertContext] Connected to YieldHub');
                    setIsConnected(true);
                } else {
                    // StrictMode unmounted us mid-start — stop the connection
                    connection.stop();
                }
            })
            .catch((e: unknown) => {
                if (mounted) {
                    console.error('[AlertContext] Connection failed:', e);
                }
            });

        return () => {
            mounted = false;
            if (connection.state !== HubConnectionState.Disconnected) {
                connection.stop();
            }
        };
    }, []);

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
