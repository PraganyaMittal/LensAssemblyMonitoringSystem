/**
 * Core TypeScript types for the LogAnalyzer feature module.
 * These types are derived from Zod schemas for runtime validation.
 */

// Re-export inferred types from schemas
export type {
    LogFileNode,
    LogFileContent,
    OperationData,
    BarrelExecutionData,
    AnalysisResult,
    InspectionImage,
    InspectionImageRequest,
    InspectionImageResponse,
    ThumbnailData,
    ThumbnailResponse,
    LogFileStructure,
} from './log.schemas';

// Additional UI-specific types (not validated at runtime)

/**
 * PC with additional version and line information for UI display
 */
export interface PCWithVersion {
    pcId: number;
    pcNumber: number;
    ipAddress: string;
    isOnline: boolean;
    modelVersion: string;
    version: string;
    line: number;
    logFilePath?: string;
}

/**
 * PC info subset passed to child components
 */
export interface PCInfo {
    line: number;
    pcNumber: number;
    logPath?: string;
}

/**
 * Tooltip position calculated for smart placement
 */
export interface TooltipPosition {
    x: number;
    y: number;
    arrowDirection: 'up' | 'down';
    arrowLeftOffset: number;
}

/**
 * Candle/bar element bounding rectangle for tooltip positioning
 */
export interface CandleRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}

/**
 * Analysis state machine states
 */
export type AnalysisStatus =
    | 'idle'
    | 'fetching'
    | 'parsing'
    | 'complete'
    | 'error';

export interface AnalysisState {
    status: AnalysisStatus;
    filePath?: string;
    content?: string;
    result?: import('./log.schemas').AnalysisResult;
    error?: Error;
}

/**
 * Log stream hook options
 */
export interface LogStreamOptions {
    pcId: number | null;
    pollingInterval?: number;
    enabled?: boolean;
}

/**
 * Log navigation hook state
 */
export interface NavigationState<T> {
    items: T[];
    selectedIndex: number;
    selectedItem: T | null;
    focusedIndex: number;
}
