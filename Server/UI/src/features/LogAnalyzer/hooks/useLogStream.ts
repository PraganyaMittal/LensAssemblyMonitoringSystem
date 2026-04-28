
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    LogFileNode,
    LogFileStructureSchema,
    validateWithFallback
} from '../types/log.schemas';
import { LOG_STRUCTURE_POLL_INTERVAL_MS } from '../constants';

const API_BASE = '/api';

export interface UseLogStreamOptions {
    
    mcId: number | null;
    
    pollingInterval?: number;
    
    enabled?: boolean;
}

export interface UseLogStreamReturn {
    
    logFiles: LogFileNode[];
    
    isLoading: boolean;
    
    error: Error | null;
    
    refetch: () => Promise<void>;
    
    reset: () => void;
}

export function useLogStream(options: UseLogStreamOptions): UseLogStreamReturn {
    const {
        mcId,
        pollingInterval = LOG_STRUCTURE_POLL_INTERVAL_MS,
        enabled = true
    } = options;

    const [logFiles, setLogFiles] = useState<LogFileNode[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    const isFirstFetchRef = useRef(true);
    const abortControllerRef = useRef<AbortController | null>(null);

    const fetchLogStructure = useCallback(async (
        targetPcId: number,
        isInitialLoad: boolean
    ): Promise<void> => {
        
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        if (isInitialLoad) {
            setIsLoading(true);
            setError(null);
        }

        try {
            const response = await fetch(
                `${API_BASE}/LogAnalyzer/structure/${targetPcId}`,
                { signal: abortControllerRef.current.signal }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({
                    error: response.statusText
                }));
                throw new Error(
                    errorData.error || `Failed to fetch log structure: ${response.statusText}`
                );
            }

            const data = await response.json();

            const validated = validateWithFallback(
                LogFileStructureSchema,
                data,
                'LogFileStructure'
            );

            setLogFiles(validated.files);
            setError(null);
        } catch (err) {
            
            if (err instanceof Error && err.name === 'AbortError') {
                return;
            }

            const error = err instanceof Error ? err : new Error('Unknown error');

            if (isInitialLoad) {
                setError(error);
            } else {
                console.warn('Log structure poll failed:', error.message);
            }
        } finally {
            if (isInitialLoad) {
                setIsLoading(false);
                isFirstFetchRef.current = false;
            }
        }
    }, []);

    const refetch = useCallback(async (): Promise<void> => {
        if (mcId !== null) {
            await fetchLogStructure(mcId, true);
        }
    }, [mcId, fetchLogStructure]);

    const reset = useCallback((): void => {
        setLogFiles([]);
        setIsLoading(false);
        setError(null);
        isFirstFetchRef.current = true;

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, []);

    useEffect(() => {
        if (mcId === null || !enabled) {
            reset();
            return;
        }

        isFirstFetchRef.current = true;
        fetchLogStructure(mcId, true);

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [mcId, enabled, fetchLogStructure, reset]);

    useEffect(() => {
        if (mcId === null || !enabled || pollingInterval <= 0) {
            return;
        }

        const intervalId = setInterval(() => {
            fetchLogStructure(mcId, false);
        }, pollingInterval);

        return () => clearInterval(intervalId);
    }, [mcId, enabled, pollingInterval, fetchLogStructure]);

    return {
        logFiles,
        isLoading,
        error,
        refetch,
        reset,
    };
}

export default useLogStream;
