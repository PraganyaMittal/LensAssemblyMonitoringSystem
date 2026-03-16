

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

export interface PCWithVersion {
    mcId: number;
    mcNumber: number;
    ipAddress: string;
    isOnline: boolean;
    modelVersion: string;
    version: string;
    line: number;
    logFilePath?: string;
}

export interface PCInfo {
    line: number;
    mcNumber: number;
    logPath?: string;
}

export interface TooltipPosition {
    x: number;
    y: number;
    arrowDirection: 'up' | 'down';
    arrowLeftOffset: number;
}

export interface CandleRect {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}

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

export interface LogStreamOptions {
    mcId: number | null;
    pollingInterval?: number;
    enabled?: boolean;
}

export interface NavigationState<T> {
    items: T[];
    selectedIndex: number;
    selectedItem: T | null;
    focusedIndex: number;
}
