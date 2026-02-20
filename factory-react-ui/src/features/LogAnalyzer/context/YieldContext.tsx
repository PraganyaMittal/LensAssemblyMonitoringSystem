/**
 * YieldContext — Real-time yield data via SignalR (replaces polling)
 *
 * Strategy:
 * 1. Fetch full summary once on mount (initial load)
 * 2. Listen for ReceiveYieldUpdate(machineId, yield) via SignalR
 * 3. Each SignalR event = one complete tray (agent uses file stability detection)
 * 4. Re-fetch full summary only when date range settings change
 *
 * StrictMode-safe: uses a mounted flag and registers handlers before start()
 */
import React, { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { HubConnectionBuilder, HubConnection, HubConnectionState, LogLevel } from '@microsoft/signalr';
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

    // Keep latest getDateRange in a ref so the SignalR effect doesn't depend on it
    const getDateRangeRef = useRef(getDateRange);
    useEffect(() => { getDateRangeRef.current = getDateRange; }, [getDateRange]);

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

    // 2. SignalR connection + subscription (runs once on mount, StrictMode-safe)
    useEffect(() => {
        let mounted = true;

        const connection = new HubConnectionBuilder()
            .withUrl('/yieldHub')
            .withAutomaticReconnect()
            .configureLogging(LogLevel.Warning)
            .build();

        connectionRef.current = connection;

        // Register handlers BEFORE start() to avoid missing events
        connection.on('ReceiveYieldUpdate', (machineId: number, newYield: number) => {
            if (mounted) {
                setYieldSummary(prev => ({ ...prev, [machineId]: newYield }));
            }
        });

        connection.onreconnected(() => {
            console.log('[YieldContext] Reconnected to YieldHub');
            if (mounted) {
                setIsConnected(true);
                // Re-fetch full summary after reconnect (may have missed updates)
                const { from, to } = getDateRangeRef.current();
                YieldService.getSummary(formatDate(from), formatDate(to))
                    .then(data => { if (mounted) setYieldSummary(data); })
                    .catch(console.error);
            }
        });

        connection.onclose(() => {
            console.log('[YieldContext] Disconnected from YieldHub');
            if (mounted) setIsConnected(false);
        });

        connection.start()
            .then(() => {
                if (mounted) {
                    console.log('[YieldContext] Connected to YieldHub');
                    setIsConnected(true);
                } else {
                    // StrictMode unmounted us mid-start — stop the connection
                    connection.stop();
                }
            })
            .catch((e: unknown) => {
                if (mounted) {
                    console.error('[YieldContext] Connection failed:', e);
                }
            });

        return () => {
            mounted = false;
            if (connection.state !== HubConnectionState.Disconnected) {
                connection.stop();
            }
        };
        // Empty deps: connect once on mount, reconnect logic handles the rest
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
