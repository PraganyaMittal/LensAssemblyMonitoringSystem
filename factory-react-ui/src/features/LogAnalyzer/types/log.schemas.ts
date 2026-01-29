/**
 * Zod schemas for runtime validation of API responses and log data.
 * TypeScript types are inferred from these schemas for type safety.
 */
import { z } from 'zod';

// =============================================================================
// LOG FILE STRUCTURE SCHEMAS
// =============================================================================

/**
 * Schema for a log file or directory node in the file tree.
 */
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

/**
 * Schema for log file content response from API.
 */
export const LogFileContentSchema = z.object({
    fileName: z.string(),
    filePath: z.string(),
    content: z.string(),
    size: z.number(),
    encoding: z.string(),
});

export type LogFileContent = z.infer<typeof LogFileContentSchema>;

/**
 * Schema for the log structure API response.
 */
export const LogFileStructureSchema = z.object({
    files: z.array(LogFileNodeSchema),
});

export type LogFileStructure = z.infer<typeof LogFileStructureSchema>;

// =============================================================================
// OPERATION DATA SCHEMAS
// =============================================================================

/**
 * Schema for a single operation's timing and metadata.
 */
export const OperationDataSchema = z.object({
    operationName: z.string(),
    // Normalized times (starts at 0 for each barrel) - used for Barrel Analysis
    startTime: z.number(),
    endTime: z.number(),
    // Global/Absolute times (from log start) - used for Long Gantt
    globalStartTime: z.number(),
    globalEndTime: z.number(),
    actualDuration: z.number(),
    idealDuration: z.number(),
    sequence: z.number(),
    barrelId: z.string(),
    // NG Inspection fields
    isNG: z.boolean().optional(),
    ngReason: z.string().optional(),
    modelName: z.string().optional(),
    trayId: z.string().optional(),
    inspectionName: z.string().optional(),
    imagePath: z.string().optional(),
});

export type OperationData = z.infer<typeof OperationDataSchema>;

/**
 * Schema for barrel execution data containing all operations.
 */
export const BarrelExecutionDataSchema = z.object({
    barrelId: z.string(),
    totalExecutionTime: z.number(),
    operations: z.array(OperationDataSchema),
});

export type BarrelExecutionData = z.infer<typeof BarrelExecutionDataSchema>;

/**
 * Schema for the complete analysis result.
 */
export const AnalysisResultSchema = z.object({
    barrels: z.array(BarrelExecutionDataSchema),
    summary: z.object({
        totalBarrels: z.number(),
        averageExecutionTime: z.number(),
        minExecutionTime: z.number(),
        maxExecutionTime: z.number(),
    }),
    rawContent: z.string().optional(),
    fileName: z.string().optional(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// =============================================================================
// INSPECTION IMAGE SCHEMAS
// =============================================================================

/**
 * Schema for a single inspection image.
 */
export const InspectionImageSchema = z.object({
    data: z.string().optional(),      // Base64 encoded image (Legacy)
    url: z.string().optional(),       // URL for binary image (New)
    filename: z.string(),             // Original filename with timestamp
    timestamp: z.string().optional(), // Parsed timestamp from filename
});

export type InspectionImage = z.infer<typeof InspectionImageSchema>;

/**
 * Schema for inspection image request.
 */
export const InspectionImageRequestSchema = z.object({
    modelName: z.string().optional(),
    trayId: z.string().optional(),
    barrelId: z.string().optional(),
    inspectionName: z.string().optional(),
    imagePath: z.string().optional(), // Direct path from NGImage log (preferred)
});

export type InspectionImageRequest = z.infer<typeof InspectionImageRequestSchema>;

/**
 * Schema for inspection image API response.
 */
export const InspectionImageResponseSchema = z.object({
    images: z.array(InspectionImageSchema),
    count: z.number(),
    operationName: z.string(),
    ngReason: z.string().optional(),
});

export type InspectionImageResponse = z.infer<typeof InspectionImageResponseSchema>;

// =============================================================================
// THUMBNAIL SCHEMAS
// =============================================================================

/**
 * Schema for thumbnail data.
 */
export const ThumbnailDataSchema = z.object({
    operationName: z.string(),
    imagePath: z.string(),
    filename: z.string(),
    data: z.string(), // Base64 encoded JPEG
});

export type ThumbnailData = z.infer<typeof ThumbnailDataSchema>;

/**
 * Schema for thumbnail API response.
 */
export const ThumbnailResponseSchema = z.object({
    logFileName: z.string(),
    thumbnails: z.array(ThumbnailDataSchema),
    count: z.number(),
});

export type ThumbnailResponse = z.infer<typeof ThumbnailResponseSchema>;

/**
 * Schema for thumbnail availability check response.
 */
export const ThumbnailAvailabilityResponseSchema = z.object({
    logFileName: z.string(),
    available: z.boolean(),
});

export type ThumbnailAvailabilityResponse = z.infer<typeof ThumbnailAvailabilityResponseSchema>;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Safely parse API response with Zod schema.
 * Returns parsed data on success, throws descriptive error on failure.
 */
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

/**
 * Safely parse with fallback to original data if validation fails.
 * Logs warning but doesn't throw.
 */
export function validateWithFallback<T>(
    schema: z.ZodType<T>,
    data: unknown,
    context: string
): T {
    const result = schema.safeParse(data);
    if (!result.success) {
        console.warn(`Validation warning for ${context}:`, result.error.format());
        return data as T; // Fallback to original data
    }
    return result.data;
}
