/**
 * useLogAnalysis - Custom hook for log file analysis workflow.
 * 
 * Features:
 * - State machine for analysis workflow (idle -> fetching -> parsing -> complete)
 * - Offloads parsing to Web Worker for large files (15-30MB)
 * - Progress reporting during parsing
 * - Error boundary integration
 */
import { useReducer, useCallback, useRef, useEffect } from 'react';
import type { AnalysisResult } from '../types/log.schemas';
import { LogFileContentSchema, validateWithFallback } from '../types/log.schemas';
import type { AnalysisStatus } from '../types/log.types';

const API_BASE = '/api';

// Threshold for using Web Worker (files over 1MB)
const WORKER_THRESHOLD_BYTES = 1 * 1024 * 1024;

// =============================================================================
// STATE MACHINE
// =============================================================================

type AnalysisAction =
    | { type: 'START_FETCH'; filePath: string }
    | { type: 'FETCH_SUCCESS'; content: string; fileName: string }
    | { type: 'START_PARSE' }
    | { type: 'PARSE_PROGRESS'; percent: number; message: string }
    | { type: 'PARSE_SUCCESS'; result: AnalysisResult }
    | { type: 'ERROR'; error: Error }
    | { type: 'RESET' };

interface AnalysisStateInternal {
    status: AnalysisStatus;
    filePath: string | null;
    content: string | null;
    fileName: string | null;
    result: AnalysisResult | null;
    error: Error | null;
    progress: {
        percent: number;
        message: string;
    } | null;
}

const initialState: AnalysisStateInternal = {
    status: 'idle',
    filePath: null,
    content: null,
    fileName: null,
    result: null,
    error: null,
    progress: null,
};

function analysisReducer(
    state: AnalysisStateInternal,
    action: AnalysisAction
): AnalysisStateInternal {
    switch (action.type) {
        case 'START_FETCH':
            return {
                ...initialState,
                status: 'fetching',
                filePath: action.filePath,
            };
        case 'FETCH_SUCCESS':
            return {
                ...state,
                status: 'parsing',
                content: action.content,
                fileName: action.fileName,
            };
        case 'START_PARSE':
            return {
                ...state,
                status: 'parsing',
            };
        case 'PARSE_PROGRESS':
            return {
                ...state,
                progress: {
                    percent: action.percent,
                    message: action.message,
                },
            };
        case 'PARSE_SUCCESS':
            return {
                ...state,
                status: 'complete',
                result: action.result,
                progress: null,
            };
        case 'ERROR':
            return {
                ...state,
                status: 'error',
                error: action.error,
                progress: null,
            };
        case 'RESET':
            return initialState;
        default:
            return state;
    }
}

// =============================================================================
// HOOK INTERFACE
// =============================================================================

export interface UseLogAnalysisOptions {
    /** PC ID for API requests */
    pcId: number | null;
    /** Optional callback when analysis completes */
    onComplete?: (result: AnalysisResult) => void;
    /** Optional callback when error occurs */
    onError?: (error: Error) => void;
    /** Optional callback for progress updates */
    onProgress?: (percent: number, message: string) => void;
}

export interface UseLogAnalysisReturn {
    /** Current analysis state */
    status: AnalysisStatus;
    /** Analysis result (when complete) */
    result: AnalysisResult | null;
    /** Error (when failed) */
    error: Error | null;
    /** Whether any loading is in progress */
    isLoading: boolean;
    /** Current progress (percent: 0-100, message: status text) */
    progress: { percent: number; message: string } | null;
    /** Start analysis for a file */
    analyzeFile: (filePath: string) => Promise<void>;
    /** Reset to idle state */
    reset: () => void;
}

/**
 * Parse log content using Web Worker for large files.
 */
function parseWithWorker(
    content: string,
    fileName: string | undefined,
    onProgress: (percent: number, message: string) => void
): Promise<AnalysisResult> {
    return new Promise((resolve, reject) => {
        // Create worker using Vite's worker syntax
        const worker = new Worker(
            new URL('../workers/logParser.worker.ts', import.meta.url),
            { type: 'module' }
        );

        worker.onmessage = (event) => {
            const { type, result, error, percent, message } = event.data;

            switch (type) {
                case 'progress':
                    onProgress(percent, message);
                    break;
                case 'success':
                    worker.terminate();
                    resolve(result);
                    break;
                case 'error':
                    worker.terminate();
                    reject(new Error(error));
                    break;
            }
        };

        worker.onerror = (event) => {
            worker.terminate();
            reject(new Error(event.message || 'Worker error'));
        };

        // Send parse request to worker
        worker.postMessage({ type: 'parse', content, fileName });
    });
}

/**
 * Fallback: Parse on main thread for small files.
 */
async function parseOnMainThread(
    content: string,
    fileName?: string
): Promise<AnalysisResult> {
    const { parseLogContent } = await import('../utils/logParser');
    return parseLogContent(content, fileName);
}

/**
 * Hook for managing log file analysis workflow.
 * 
 * @example
 * ```tsx
 * const { status, result, progress, analyzeFile, reset } = useLogAnalysis({
 *   pcId: selectedPC?.pcId ?? null,
 *   onProgress: (percent, message) => console.log(`${percent}%: ${message}`),
 * });
 * 
 * // Trigger analysis
 * await analyzeFile('/path/to/log.txt');
 * 
 * // Show progress during parsing
 * if (status === 'parsing' && progress) {
 *   console.log(`Parsing: ${progress.percent}% - ${progress.message}`);
 * }
 * ```
 */
export function useLogAnalysis(options: UseLogAnalysisOptions): UseLogAnalysisReturn {
    const { pcId, onComplete, onError, onProgress } = options;

    const [state, dispatch] = useReducer(analysisReducer, initialState);
    const abortControllerRef = useRef<AbortController | null>(null);
    const workerRef = useRef<Worker | null>(null);

    /**
     * Analyze a log file by fetching content and parsing with Web Worker.
     */
    const analyzeFile = useCallback(async (filePath: string): Promise<void> => {
        if (pcId === null) {
            dispatch({
                type: 'ERROR',
                error: new Error('No PC selected')
            });
            return;
        }

        // Cancel previous request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        // Terminate any existing worker
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }

        dispatch({ type: 'START_FETCH', filePath });

        try {
            // 1. Fetch log file content
            const response = await fetch(`${API_BASE}/LogAnalyzer/file/${pcId}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath }),
                signal: abortControllerRef.current.signal,
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({
                    error: response.statusText
                }));
                throw new Error(
                    errorData.error || `Failed to fetch log file: ${response.statusText}`
                );
            }

            const data = await response.json();

            // Validate response
            const validated = validateWithFallback(
                LogFileContentSchema,
                data,
                'LogFileContent'
            );

            dispatch({
                type: 'FETCH_SUCCESS',
                content: validated.content,
                fileName: validated.fileName,
            });

            // 2. Parse content - use Worker for large files
            const contentSize = validated.content.length;
            const useWorker = contentSize > WORKER_THRESHOLD_BYTES;

            const handleProgress = (percent: number, message: string) => {
                dispatch({ type: 'PARSE_PROGRESS', percent, message });
                onProgress?.(percent, message);
            };

            let result: AnalysisResult;

            if (useWorker) {
                console.log(`Using Web Worker for ${(contentSize / 1024 / 1024).toFixed(2)}MB file`);
                result = await parseWithWorker(
                    validated.content,
                    validated.fileName,
                    handleProgress
                );
            } else {
                // Small file - parse on main thread
                result = await parseOnMainThread(
                    validated.content,
                    validated.fileName
                );
            }

            dispatch({ type: 'PARSE_SUCCESS', result });
            onComplete?.(result);

        } catch (err) {
            // Ignore abort errors
            if (err instanceof Error && err.name === 'AbortError') {
                return;
            }

            const error = err instanceof Error ? err : new Error('Unknown error');
            dispatch({ type: 'ERROR', error });
            onError?.(error);
        }
    }, [pcId, onComplete, onError, onProgress]);

    /**
     * Reset the analysis state.
     */
    const reset = useCallback((): void => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }
        dispatch({ type: 'RESET' });
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            if (workerRef.current) {
                workerRef.current.terminate();
            }
        };
    }, []);

    return {
        status: state.status,
        result: state.result,
        error: state.error,
        isLoading: state.status === 'fetching' || state.status === 'parsing',
        progress: state.progress,
        analyzeFile,
        reset,
    };
}

export default useLogAnalysis;
