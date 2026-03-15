
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


const POLL_INTERVAL_MS = 30_000;

export const YieldProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [yieldSummary, setYieldSummary] = useState<YieldSummary>({});
    const { connection, isConnected } = useSignalR();
    const { getDateRange, settings } = useLogAnalyzerSettingsSafe();

    
    const getDateRangeRef = useRef(getDateRange);
    useEffect(() => { getDateRangeRef.current = getDateRange; }, [getDateRange]);

    
    const formatDate = useCallback((d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }, []);

    
    
    const fetchYieldSummary = useCallback(async () => {
        try {
            const { from, to } = getDateRangeRef.current();
            const data = await YieldService.getSummary(formatDate(from), formatDate(to));
            setYieldSummary(data);
        } catch (err) {
            console.error('Failed to fetch yield summary', err);
        }
    }, [formatDate]);

    
    useEffect(() => {
        fetchYieldSummary();
    }, [settings.dateRange, fetchYieldSummary]);

    
    useEffect(() => {
        if (!connection) return;

        let mounted = true;

        const handleReceiveYieldUpdate = (machineId: number, newYield: number) => {
            if (mounted) {
                console.log(`[YieldContext] SignalR update: MC=${machineId}, Yield=${newYield.toFixed(1)}%`);
                setYieldSummary(prev => ({ ...prev, [machineId]: newYield }));
            }
        };

        
        connection.on('ReceiveYieldUpdate', handleReceiveYieldUpdate);

        
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

    
    const wasConnected = useRef(isConnected);
    useEffect(() => {
        if (isConnected && !wasConnected.current) {
            console.log('[YieldContext] SignalR reconnected — re-fetching yield summary');
            fetchYieldSummary();
        }
        wasConnected.current = isConnected;
    }, [isConnected, fetchYieldSummary]);

    
    
    useEffect(() => {
        if (isConnected) {
            
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
