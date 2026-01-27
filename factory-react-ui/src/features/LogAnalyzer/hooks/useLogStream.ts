/**
 * useLogStream - Custom hook for fetching and polling log file structure.
 * 
 * Features:
 * - Initial fetch when PC is selected
 * - Automatic polling every 5 seconds
 * - Zod validation of API responses
 * - Error handling with retry capability
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import {
    LogFileNode,
    LogFileStructureSchema,
    validateWithFallback
} from '../types/log.schemas';
import { LOG_STRUCTURE_POLL_INTERVAL_MS } from '../constants';

const API_BASE = '/api';

export interface UseLogStreamOptions {
    /** PC ID to fetch log structure for */
    pcId: number | null;
    /** Polling interval in milliseconds (default: 5000) */
    pollingInterval?: number;
    /** Whether polling is enabled (default: true when pcId is set) */
    enabled?: boolean;
}

export interface UseLogStreamReturn {
    /** Array of log file nodes */
    logFiles: LogFileNode[];
    /** Whether initial load is in progress */
    isLoading: boolean;
    /** Error from last fetch attempt */
    error: Error | null;
    /** Manually trigger a refetch */
    refetch: () => Promise<void>;
    /** Clear all data and reset state */
    reset: () => void;
}

/**
 * Hook for managing log file structure data with automatic polling.
 * 
 * @example
 * ```tsx
 * const { logFiles, isLoading, error, refetch } = useLogStream({
 *   pcId: selectedPC?.pcId ?? null,
 *   pollingInterval: 5000,
 * });
 * ```
 */
export function useLogStream(options: UseLogStreamOptions): UseLogStreamReturn {
    const {
        pcId,
        pollingInterval = LOG_STRUCTURE_POLL_INTERVAL_MS,
        enabled = true
    } = options;

    const [logFiles, setLogFiles] = useState<LogFileNode[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<Error | null>(null);

    // Track if this is the first fetch (for loading state)
    const isFirstFetchRef = useRef(true);
    const abortControllerRef = useRef<AbortController | null>(null);

    /**
     * Fetch log structure from the API.
     */
    const fetchLogStructure = useCallback(async (
        targetPcId: number,
        isInitialLoad: boolean
    ): Promise<void> => {
        // Cancel any in-flight request
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

            // Validate response with Zod (with fallback for backwards compatibility)
            const validated = validateWithFallback(
                LogFileStructureSchema,
                data,
                'LogFileStructure'
            );

            setLogFiles(validated.files);
            setError(null);
        } catch (err) {
            // Ignore abort errors
            if (err instanceof Error && err.name === 'AbortError') {
                return;
            }

            const error = err instanceof Error ? err : new Error('Unknown error');

            // Only set error state on initial load, not polling failures
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

    /**
     * Manual refetch trigger.
     */
    const refetch = useCallback(async (): Promise<void> => {
        if (pcId !== null) {
            await fetchLogStructure(pcId, true);
        }
    }, [pcId, fetchLogStructure]);

    /**
     * Reset all state.
     */
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

    // Initial fetch when pcId changes
    useEffect(() => {
        if (pcId === null || !enabled) {
            reset();
            return;
        }

        isFirstFetchRef.current = true;
        fetchLogStructure(pcId, true);

        // Cleanup on unmount or pcId change
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, [pcId, enabled, fetchLogStructure, reset]);

    // Polling effect
    useEffect(() => {
        if (pcId === null || !enabled || pollingInterval <= 0) {
            return;
        }

        const intervalId = setInterval(() => {
            fetchLogStructure(pcId, false);
        }, pollingInterval);

        return () => clearInterval(intervalId);
    }, [pcId, enabled, pollingInterval, fetchLogStructure]);

    return {
        logFiles,
        isLoading,
        error,
        refetch,
        reset,
    };
}

export default useLogStream;
