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
    
    startTime: number;
    endTime: number;
    
    globalStartTime: number;
    globalEndTime: number;
    actualDuration: number;
    idealDuration: number;
    sequence: number;
    barrelId: string; 
    lensTrayId?: string;      

    
    isNG?: boolean;           
    ngReason?: string;        
    modelName?: string;       
    trayId?: string;          
    inspectionName?: string;  
    imagePath?: string;       
}


export const OPERATION_INSPECTION_MAP: Record<string, string> = {
    'Lens_Tray_Align': 'Lens Over',
    'Lens_Pickup': 'Lens Under1',
    'Lens_Align': 'Lens Under2',
    'Mask_Pickup': 'Mask Under',
    'Barrel_Align_Mask': 'Assy Tray Over1',
    'Barrel_Align_Lens': 'Assy Tray Over2',
};


export interface InspectionImage {
    data?: string;            
    url?: string;             
    filename: string;         
    timestamp?: string;       
}


export interface InspectionImageRequest {
    modelName?: string;    
    trayId?: string;       
    barrelId?: string;     
    inspectionName?: string; 
    imagePath?: string;    
}


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


export interface TrayLoadSubOperation {
    operationName: string;
    startTime: number;
    endTime: number;
    actualDuration: number;
    idealDuration: number;
    lensTrayId: string;
    barrelId: string;
}


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
