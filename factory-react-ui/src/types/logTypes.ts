export interface LogFileNode {
    name: string;
    path: string;
    isDirectory: boolean;
    size?: number;
    modifiedDate?: string;
    children?: LogFileNode[];
}

export interface LogFileContent {
    fileName: string;
    filePath: string;
    content: string;
    size: number;
    encoding: string;
}

export interface OperationData {
    operationName: string;
    // Normalized times (starts at 0 for each barrel) - used for Barrel Analysis
    startTime: number;
    endTime: number;
    // Global/Absolute times (from log start) - used for Long Gantt
    globalStartTime: number;
    globalEndTime: number;
    actualDuration: number;
    idealDuration: number;
    sequence: number;
    barrelId: string; // Added for easy reference in tooltips/charts
    lensTrayId?: string;      // Lens Tray ID for tray load operations

    // NG Inspection fields
    isNG?: boolean;           // True if inspection failed
    ngReason?: string;        // Failure reason from log
    modelName?: string;       // Model name for image path (e.g., "S26")
    trayId?: string;          // Tray ID for image path
    inspectionName?: string;  // Mapped inspection folder name
    imagePath?: string;       // Direct image path from NGImage log
}

// Operation name to inspection folder mapping
export const OPERATION_INSPECTION_MAP: Record<string, string> = {
    'Lens_Tray_Align': 'Lens Over',
    'Lens_Pickup': 'Lens Under1',
    'Lens_Align': 'Lens Under2',
    'Mask_Pickup': 'Mask Under',
    'Barrel_Align_Mask': 'Assy Tray Over1',
    'Barrel_Align_Lens': 'Assy Tray Over2',
};

// Inspection image data structure
export interface InspectionImage {
    data?: string;            // Base64 encoded image (Legacy)
    url?: string;             // URL for binary image (New)
    filename: string;         // Original filename with timestamp
    timestamp?: string;       // Parsed timestamp from filename
}

// Request structure for fetching inspection images
export interface InspectionImageRequest {
    modelName?: string;    // Optional if imagePath is provided
    trayId?: string;       // Optional if imagePath is provided
    barrelId?: string;     // Optional if imagePath is provided
    inspectionName?: string; // Optional if imagePath is provided
    imagePath?: string;    // Direct path from NGImage log (preferred)
}

// Response from image API
export interface InspectionImageResponse {
    images: InspectionImage[];
    count: number;
    operationName: string;
    ngReason?: string;
}

export interface BarrelExecutionData {
    barrelId: string;
    totalExecutionTime: number;
    operations: OperationData[];
}

// Sub-operation within a Tray Load (e.g., Magazine Run, Tray Move)
export interface TrayLoadSubOperation {
    operationName: string;
    startTime: number;
    endTime: number;
    actualDuration: number;
    idealDuration: number;
    lensTrayId: string;
    barrelId: string;
}

// A single Tray Load event (Sequence_Load_Tray)
export interface TrayLoadData {
    lensTrayId: string;
    barrelId: string;
    startTime: number;
    endTime: number;
    totalDuration: number;
    subOperations: TrayLoadSubOperation[];
}

export interface AnalysisResult {
    barrels: BarrelExecutionData[];
    trayLoads: TrayLoadData[];
    summary: {
        totalBarrels: number;
        averageExecutionTime: number;
        minExecutionTime: number;
        maxExecutionTime: number;
    };
    rawContent?: string;
    fileName?: string;
}

export interface FactoryPC {
    mcId: number;
    mcNumber: number;
    lineNumber: number;
    ipAddress: string;
    isOnline: boolean;
    modelVersion: string;
    logFilePath: string;
}

export interface LogFileStructure {
    files: LogFileNode[];
}
