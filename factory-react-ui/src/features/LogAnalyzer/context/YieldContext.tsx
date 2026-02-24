/**
 * YieldContext — Real-time yield data via SignalR (replaces polling)
 *
 * Strategy:
 * 1. Fetch full summary once on mount (initial load)
 * 2. Listen for ReceiveYieldUpdate(machineId, yield) via SignalR
 * 3. Each SignalR event = one complete tray (agent uses file stability detection)
 * 4. Re-fetch full summary only when date range settings change or on reconnect
 *
 * StrictMode-safe: uses a mounted flag and shared SignalR context
 */
import React, { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { YieldService, YieldSummary } from '../../../services/YieldService';
import { useLogAnalyzerSettingsSafe } from './LogAnalyzerSettingsContext';
import { useSignalR } from './SignalRContext';

interface YieldContextValue {
    yieldSummary: YieldSummary;
    isConnected: boolean;
}

const YieldContext = createContext<YieldContextValue | null>(null);

export const YieldProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [yieldSummary, setYieldSummary] = useState<YieldSummary>({});
    const { connection, isConnected } = useSignalR();
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
    //    We also expose the fetch so we can reuse it on reconnects
    const fetchYieldSummary = useCallback(async () => {
        try {
            const { from, to } = getDateRangeRef.current();
            const data = await YieldService.getSummary(formatDate(from), formatDate(to));
            setYieldSummary(data);
        } catch (err) {
            console.error('Failed to fetch yield summary', err);
        }
    }, [formatDate]);

    // Run when settings/dateRange change
    useEffect(() => {
        fetchYieldSummary();
    }, [settings.dateRange, fetchYieldSummary]);

    // 2. SignalR Event Subscription
    useEffect(() => {
        if (!connection) return;

        let mounted = true;

        const handleReceiveYieldUpdate = (machineId: number, newYield: number) => {
            if (mounted) {
                setYieldSummary(prev => ({ ...prev, [machineId]: newYield }));
            }
        };

        connection.on('ReceiveYieldUpdate', handleReceiveYieldUpdate);

        // SignalR Core doesn't let us easily hook into onreconnected multiple times 
        // without overriding or managing an array of callbacks. 
        // We can listen for the built-in Reconnected logic or rely on isConnected state change below.

        return () => {
            mounted = false;
            connection.off('ReceiveYieldUpdate', handleReceiveYieldUpdate);
        };
    }, [connection, fetchYieldSummary]);

    // Re-fetch when connection is re-established to ensure we didn't miss updates
    // using the isConnected state from the provider.
    // Skip the very first "true" state since the initial fetch handles it,
    // but React guarantees useEffect runs after render. We use a ref to track if it's a reconnect.
    const wasConnected = useRef(isConnected);
    useEffect(() => {
        // If transitioning from offline to online, re-fetch.
        if (isConnected && !wasConnected.current) {
            // Reconnected!
            fetchYieldSummary();
        }
        wasConnected.current = isConnected;
    }, [isConnected, fetchYieldSummary]);

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
