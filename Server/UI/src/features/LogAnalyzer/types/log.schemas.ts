
import { z } from 'zod';

// ─── Log File Structure (unchanged) ────────────────────────────────────────

export const LogFileNodeSchema: z.ZodType<LogFileNode> = z.lazy(() =>
    z.object({
        name: z.string(),
        path: z.string(),
        isDirectory: z.boolean(),
        size: z.number().optional(),
        children: z.array(LogFileNodeSchema).optional(),
    })
);

export interface LogFileNode {
    name: string;
    path: string;
    isDirectory: boolean;
    size?: number;
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

// ─── Counter Types ─────────────────────────────────────────────────────────

export type CounterType = 'lensId' | 'spacerId' | 'barrelId' | 'lensTrayId';

// ─── Barrel Receipt (from Sequence_Barrel_Complete SET) ────────────────────

export const BarrelReceiptSchema = z.object({
    barrelId: z.number(),
    lensId: z.number(),
    spacerId: z.number(),
});

export type BarrelReceipt = z.infer<typeof BarrelReceiptSchema>;

// ─── Operation Data (generic, counter-based) ───────────────────────────────

export const OperationDataSchema = z.object({
    operationName: z.string(),
    /** Split by "/" for sub-operation hierarchy */
    hierarchy: z.array(z.string()),

    counterType: z.enum(['lensId', 'spacerId', 'barrelId', 'lensTrayId']),
    counterId: z.number(),

    /** Absolute timestamps from log (no normalization) */
    startTs: z.number(),
    endTs: z.number(),
    duration: z.number(),

    idealMs: z.number().optional(),

    barrelTrayId: z.string(),

    /** NG fields — NG can occur on ANY operation */
    isNg: z.boolean(),
    ngPath: z.string().optional(),
    ngCode: z.string().optional(),
});

export type OperationData = z.infer<typeof OperationDataSchema>;

// ─── Barrel (with receipt + range-mapped operations) ───────────────────────

export const BarrelSchema = z.object({
    barrelId: z.number(),
    barrelTrayId: z.string(),
    receipt: BarrelReceiptSchema,
    operations: z.array(OperationDataSchema),

    /** Inclusive ownership ranges derived from receipts */
    lensRange: z.tuple([z.number(), z.number()]),
    spacerRange: z.tuple([z.number(), z.number()]),

    totalDuration: z.number(),

    /** startTs of the first barrel-direct operation (for vertical marker line) */
    barrelAlignStartTs: z.number(),
});

export type Barrel = z.infer<typeof BarrelSchema>;

// ─── Barrel Tray (top-level grouping) ──────────────────────────────────────

export const BarrelTraySchema = z.object({
    barrelTrayId: z.string(),
    barrels: z.array(BarrelSchema),
    /** Tray-level operations (Load_Tray, Pallet_In, etc.) */
    trayOperations: z.array(OperationDataSchema),
    totalDuration: z.number(),
    isIncomplete: z.boolean(),
});

export type BarrelTray = z.infer<typeof BarrelTraySchema>;

// ─── Analysis Result ───────────────────────────────────────────────────────

export const AnalysisResultSchema = z.object({
    trays: z.array(BarrelTraySchema),
    /** All unique operation names discovered (for settings modal) */
    allOperationNames: z.array(z.string()),
    summary: z.object({
        totalTrays: z.number(),
        totalBarrels: z.number(),
        averageExecutionTime: z.number(),
        minExecutionTime: z.number(),
        maxExecutionTime: z.number(),
    }),
    fileName: z.string().optional(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// ─── Inspection Images ─────────────────────────────────────────────────────

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
    ngPath: z.string().optional(),
});

export type InspectionImageRequest = z.infer<typeof InspectionImageRequestSchema>;

export const InspectionImageResponseSchema = z.object({
    images: z.array(InspectionImageSchema),
    count: z.number(),
    operationName: z.string(),
    ngCode: z.string().optional(),
});

export type InspectionImageResponse = z.infer<typeof InspectionImageResponseSchema>;

// ─── Validation Helpers ────────────────────────────────────────────────────

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
