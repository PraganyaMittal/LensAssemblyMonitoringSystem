export interface LogFileNode {
    name: string;
    path: string;
    isDirectory: boolean;
    size?: number;
    children?: LogFileNode[];
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

export interface InspectionImage {
    data?: string;            
    url?: string;             
    filename: string;         
    timestamp?: string;       
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
    fileName?: string;
}
