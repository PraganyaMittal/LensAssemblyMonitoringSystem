/**
 * YieldContext — Real-time yield data via SignalR with polling fallback
 *
 * Strategy:
 * 1. Fetch full summary once on mount (initial load)
 * 2. Listen for ReceiveYieldUpdate(machineId, yield) via SignalR
 * 3. Each SignalR event = one complete tray (agent uses file stability detection)
 * 4. Re-fetch full summary only when date range settings change or on reconnect
 * 5. FALLBACK: If SignalR is not connected, poll every 30s to keep data fresh
 *
 * StrictMode-safe: uses a mounted flag and shared SignalR context
 */
import React, { createContext, useContext, useEffect, useState, useRef, useCallback, ReactNode } from 'react';
import { HubConnectionState } from '@microsoft/signalr';
import { YieldService, YieldSummary } from '../../../services/YieldService';
import { useLogAnalyzerSettingsSafe } from './LogAnalyzerSettingsContext';
import { useSignalR } from './SignalRContext';

interface YieldContextValue {
    yieldSummary: YieldSummary;
    isConnected: boolean;
}

const YieldContext = createContext<YieldContextValue | null>(null);

/** How often to poll when SignalR is not connected (ms) */
const POLL_INTERVAL_MS = 30_000;

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

    // 2. SignalR Event Subscription — only when connected
    useEffect(() => {
        if (!connection) return;

        let mounted = true;

        const handleReceiveYieldUpdate = (machineId: number, newYield: number) => {
            if (mounted) {
                console.log(`[YieldContext] SignalR update: MC=${machineId}, Yield=${newYield.toFixed(1)}%`);
                setYieldSummary(prev => ({ ...prev, [machineId]: newYield }));
            }
        };

        // Register handler immediately — SignalR allows pre-start registration
        connection.on('ReceiveYieldUpdate', handleReceiveYieldUpdate);

        // If connection is already started, also log state for diagnostics
        if (connection.state === HubConnectionState.Connected) {
            console.log('[YieldContext] Handler registered on CONNECTED hub');
        } else {
            console.log(`[YieldContext] Handler registered on hub (state: ${connection.state})`);
        }

        return () => {
            mounted = false;
            connection.off('ReceiveYieldUpdate', handleReceiveYieldUpdate);
        };
    }, [connection]);

    // 3. Re-fetch when connection is (re-)established to ensure we didn't miss updates
    const wasConnected = useRef(isConnected);
    useEffect(() => {
        if (isConnected && !wasConnected.current) {
            console.log('[YieldContext] SignalR reconnected — re-fetching yield summary');
            fetchYieldSummary();
        }
        wasConnected.current = isConnected;
    }, [isConnected, fetchYieldSummary]);

    // 4. POLLING FALLBACK: When SignalR is not connected, poll periodically
    //    This ensures the UI stays fresh even if WebSocket fails silently
    useEffect(() => {
        if (isConnected) {
            // SignalR is live — no polling needed
            return;
        }

        console.log('[YieldContext] SignalR not connected — enabling polling fallback');
        const intervalId = setInterval(() => {
            console.log('[YieldContext] Polling yield summary (fallback)');
            fetchYieldSummary();
        }, POLL_INTERVAL_MS);

        return () => clearInterval(intervalId);
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
