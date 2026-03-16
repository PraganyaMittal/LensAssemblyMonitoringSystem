
import { useReducer, useCallback, useRef, useEffect } from 'react';
import type { AnalysisResult } from '../types/log.schemas';
import { LogFileContentSchema, validateWithFallback } from '../types/log.schemas';
import type { AnalysisStatus } from '../types/log.types';

const API_BASE = '/api';

const WORKER_THRESHOLD_BYTES = 1 * 1024 * 1024;

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

export interface UseLogAnalysisOptions {
    
    mcId: number | null;
    
    onComplete?: (result: AnalysisResult) => void;
    
    onError?: (error: Error) => void;
    
    onProgress?: (percent: number, message: string) => void;
}

export interface UseLogAnalysisReturn {
    
    status: AnalysisStatus;
    
    result: AnalysisResult | null;
    
    error: Error | null;
    
    isLoading: boolean;
    
    progress: { percent: number; message: string } | null;
    
    analyzeFile: (filePath: string) => Promise<void>;
    
    reset: () => void;
}

function parseWithWorker(
    content: string,
    fileName: string | undefined,
    onProgress: (percent: number, message: string) => void
): Promise<AnalysisResult> {
    return new Promise((resolve, reject) => {
        
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

        worker.postMessage({ type: 'parse', content, fileName });
    });
}

async function parseOnMainThread(
    content: string,
    fileName?: string
): Promise<AnalysisResult> {
    const { parseLogContent } = await import('../utils/logParser');
    return parseLogContent(content, fileName);
}

export function useLogAnalysis(options: UseLogAnalysisOptions): UseLogAnalysisReturn {
    const { mcId, onComplete, onError, onProgress } = options;

    const [state, dispatch] = useReducer(analysisReducer, initialState);
    const abortControllerRef = useRef<AbortController | null>(null);
    const workerRef = useRef<Worker | null>(null);

    const analyzeFile = useCallback(async (filePath: string): Promise<void> => {
        if (mcId === null) {
            dispatch({
                type: 'ERROR',
                error: new Error('No PC selected')
            });
            return;
        }

        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        abortControllerRef.current = new AbortController();

        if (workerRef.current) {
            workerRef.current.terminate();
            workerRef.current = null;
        }

        dispatch({ type: 'START_FETCH', filePath });

        try {
            
            const response = await fetch(`${API_BASE}/LogAnalyzer/file/${mcId}`, {
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
                
                result = await parseOnMainThread(
                    validated.content,
                    validated.fileName
                );
            }

            dispatch({ type: 'PARSE_SUCCESS', result });
            onComplete?.(result);

        } catch (err) {
            
            if (err instanceof Error && err.name === 'AbortError') {
                return;
            }

            const error = err instanceof Error ? err : new Error('Unknown error');
            dispatch({ type: 'ERROR', error });
            onError?.(error);
        }
    }, [mcId, onComplete, onError, onProgress]);

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
