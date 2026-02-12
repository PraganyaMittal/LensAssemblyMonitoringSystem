/**
 * YieldContext — Real-time yield data via SignalR (replaces polling)
 *
 * Strategy:
 * 1. Fetch full summary once on mount (initial load)
 * 2. Listen for ReceiveYieldUpdate(machineId, yield) via SignalR
 * 3. Each SignalR event = one complete tray (agent uses file stability detection)
 * 4. Re-fetch full summary only when date range settings change
 */
import React, { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { HubConnectionBuilder, HubConnection, HubConnectionState } from '@microsoft/signalr';
import { YieldService, YieldSummary } from '../../../services/YieldService';
import { useLogAnalyzerSettingsSafe } from './LogAnalyzerSettingsContext';

interface YieldContextValue {
    yieldSummary: YieldSummary;
    isConnected: boolean;
}

const YieldContext = createContext<YieldContextValue | null>(null);

export const YieldProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [yieldSummary, setYieldSummary] = useState<YieldSummary>({});
    const [isConnected, setIsConnected] = useState(false);
    const connectionRef = useRef<HubConnection | null>(null);

    const { getDateRange, settings } = useLogAnalyzerSettingsSafe();

    // Format date as YYYY-MM-DD (local timezone)
    const formatDate = useCallback((d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, []);

    // 1. Fetch full summary on mount and when date range changes
    useEffect(() => {
        const fetchInitial = async () => {
            try {
                const { from, to } = getDateRange();
                const data = await YieldService.getSummary(formatDate(from), formatDate(to));
                setYieldSummary(data);
            } catch (err) {
                console.error('Failed to fetch initial yield summary', err);
            }
        };
        fetchInitial();
    }, [settings.dateRange, getDateRange, formatDate]);

    // 2. SignalR connection + subscription
    useEffect(() => {
        const connection = new HubConnectionBuilder()
            .withUrl('/yieldHub')
            .withAutomaticReconnect()
            .build();

        connectionRef.current = connection;

        connection.start()
            .then(() => {
                console.log('[YieldContext] Connected to YieldHub');
                setIsConnected(true);

                // Each ReceiveYieldUpdate = one complete tray (agent waits for file stability)
                connection.on('ReceiveYieldUpdate', (machineId: number, newYield: number) => {
                    setYieldSummary(prev => ({ ...prev, [machineId]: newYield }));
                });
            })
            .catch((e: unknown) => console.error('[YieldContext] Connection failed:', e));

        connection.onreconnected(() => {
            console.log('[YieldContext] Reconnected to YieldHub');
            setIsConnected(true);

            // Re-fetch full summary after reconnect (may have missed updates)
            const { from, to } = getDateRange();
            YieldService.getSummary(formatDate(from), formatDate(to))
                .then(setYieldSummary)
                .catch(console.error);
        });

        connection.onclose(() => {
            console.log('[YieldContext] Disconnected from YieldHub');
            setIsConnected(false);
        });

        return () => {
            if (connection.state !== HubConnectionState.Disconnected) {
                connection.stop();
            }
        };
    }, [getDateRange, formatDate]);

    return (
        <YieldContext.Provider value={{ yieldSummary, isConnected }}>
            {children}
        </YieldContext.Provider>
    );
};

export const useYield = (): YieldContextValue => {
    const context = useContext(YieldContext);
    if (!context) throw new Error('useYield must be used within YieldProvider');
    return context;
};
