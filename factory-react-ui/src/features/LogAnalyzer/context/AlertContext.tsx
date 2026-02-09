import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { HubConnectionBuilder, HubConnection } from '@microsoft/signalr';
import { AlertService, YieldAlert } from '../../../services/AlertService';

interface AlertContextValue {
    alerts: YieldAlert[];
    acknowledgeAlert: (id: number) => Promise<void>;
    isConnected: boolean;
}

const AlertContext = createContext<AlertContextValue | null>(null);

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [alerts, setAlerts] = useState<YieldAlert[]>([]);
    const [connection, setConnection] = useState<HubConnection | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    // Fetch initial active alerts
    useEffect(() => {
        AlertService.getActiveAlerts().then(setAlerts).catch(console.error);
    }, []);

    // SignalR Connection
    useEffect(() => {
        const newConnection = new HubConnectionBuilder()
            .withUrl('/yieldHub')
            .withAutomaticReconnect()
            .build();

        setConnection(newConnection);
    }, []);

    useEffect(() => {
        if (connection) {
            connection.start()
                .then(() => {
                    console.log('Connected to YieldHub');
                    setIsConnected(true);

                    connection.on('ReceiveAlert', (alert: YieldAlert) => {
                        setAlerts(prev => {
                            if (prev.find(a => a.id === alert.id)) return prev;
                            return [alert, ...prev];
                        });
                        // Can trigger toast here if needed via another state or callback
                    });

                    connection.on('ResolveAlert', (id: number) => {
                        setAlerts(prev => prev.filter(a => a.id !== id));
                    });

                    connection.on('AcknowledgeAlert', (id: number) => {
                        setAlerts(prev => prev.map(a =>
                            a.id === id ? { ...a, isAcknowledged: true, acknowledgedAt: new Date().toISOString() } : a
                        ));
                    });

                    connection.on('DeleteAlert', (id: number) => {
                        setAlerts(prev => prev.filter(a => a.id !== id));
                    });

                    connection.on('ClearAllAlerts', () => {
                        setAlerts([]);
                    });
                })
                .catch((e: unknown) => console.error('Connection failed: ', e));

            return () => {
                connection.stop();
            };
        }
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
