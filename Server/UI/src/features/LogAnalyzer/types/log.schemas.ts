
import { z } from 'zod';

export const LogFileNodeSchema: z.ZodType<LogFileNode> = z.lazy(() =>
    z.object({
        name: z.string(),
        path: z.string(),
        isDirectory: z.boolean(),
        size: z.number().optional(),
        modifiedDate: z.string().optional(),
        children: z.array(LogFileNodeSchema).optional(),
    })
);

export interface LogFileNode {
    name: string;
    path: string;
    isDirectory: boolean;
    size?: number;
    modifiedDate?: string;
    children?: LogFileNode[];
}

export const LogFileContentSchema = z.object({
    fileName: z.string(),
    filePath: z.string(),
    content: z.string(),
    size: z.number(),
    encoding: z.string(),
});

export type LogFileContent = z.infer<typeof LogFileContentSchema>;

export const LogFileStructureSchema = z.object({
    files: z.array(LogFileNodeSchema),
});

export type LogFileStructure = z.infer<typeof LogFileStructureSchema>;

export const OperationDataSchema = z.object({
    operationName: z.string(),
    
    startTime: z.number(),
    endTime: z.number(),
    
    globalStartTime: z.number(),
    globalEndTime: z.number(),
    actualDuration: z.number(),
    idealDuration: z.number(),
    sequence: z.number(),
    barrelId: z.string(),
    lensTrayId: z.string().optional(),
    
    isNG: z.boolean().optional(),
    ngReason: z.string().optional(),
    modelName: z.string().optional(),
    trayId: z.string().optional(),
    inspectionName: z.string().optional(),
    imagePath: z.string().optional(),
});

export type OperationData = z.infer<typeof OperationDataSchema>;

export const BarrelExecutionDataSchema = z.object({
    barrelId: z.string(),
    totalExecutionTime: z.number(),
    operations: z.array(OperationDataSchema),
});

export type BarrelExecutionData = z.infer<typeof BarrelExecutionDataSchema>;

export const TrayLoadSubOperationSchema = z.object({
    operationName: z.string(),
    startTime: z.number(),
    endTime: z.number(),
    actualDuration: z.number(),
    idealDuration: z.number(),
    lensTrayId: z.string(),
    barrelId: z.string(),
});

export type TrayLoadSubOperation = z.infer<typeof TrayLoadSubOperationSchema>;

export const TrayLoadDataSchema = z.object({
    lensTrayId: z.string(),
    barrelId: z.string(),
    startTime: z.number(),
    endTime: z.number(),
    totalDuration: z.number(),
    subOperations: z.array(TrayLoadSubOperationSchema),
});

export type TrayLoadData = z.infer<typeof TrayLoadDataSchema>;

export const AnalysisResultSchema = z.object({
    barrels: z.array(BarrelExecutionDataSchema),
    trayLoads: z.array(TrayLoadDataSchema),
    summary: z.object({
        totalBarrels: z.number(),
        averageExecutionTime: z.number(),
        minExecutionTime: z.number(),
        maxExecutionTime: z.number(),
    }),
    fileName: z.string().optional(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export const InspectionImageSchema = z.object({
    data: z.string().optional(),      
    url: z.string().optional(),       
    filename: z.string(),             
    timestamp: z.string().optional(), 
});

export type InspectionImage = z.infer<typeof InspectionImageSchema>;

export const InspectionImageRequestSchema = z.object({
    modelName: z.string().optional(),
    trayId: z.string().optional(),
    barrelId: z.string().optional(),
    inspectionName: z.string().optional(),
    imagePath: z.string().optional(), 
});

export type InspectionImageRequest = z.infer<typeof InspectionImageRequestSchema>;

export const InspectionImageResponseSchema = z.object({
    images: z.array(InspectionImageSchema),
    count: z.number(),
    operationName: z.string(),
    ngReason: z.string().optional(),
});

export type InspectionImageResponse = z.infer<typeof InspectionImageResponseSchema>;



export function validateApiResponse<T>(
    schema: z.ZodType<T>,
    data: unknown,
    context: string
): T {
    const result = schema.safeParse(data);
    if (!result.success) {
        console.error(`Validation failed for ${context}:`, result.error.format());
        throw new Error(`Invalid ${context} response: ${result.error.message}`);
    }
    return result.data;
}

export function validateWithFallback<T>(
    schema: z.ZodType<T>,
    data: unknown,
    context: string
): T {
    const result = schema.safeParse(data);
    if (!result.success) {
        console.warn(`Validation warning for ${context}:`, result.error.format());
        return data as T; 
    }
    return result.data;
}
