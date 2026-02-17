/**
 * Log Parser Utility
 * 
 * Parses raw log content into structured AnalysisResult data.
 * This is the core parsing logic used by useLogAnalysis hook.
 * 
 * NOTE: For large log files, this should be offloaded to a Web Worker
 * to prevent blocking the main thread.
 */
import type { AnalysisResult, BarrelExecutionData, OperationData, TrayLoadData, TrayLoadSubOperation } from '../types/log.schemas';
import { OPERATION_INSPECTION_MAP } from '../constants';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract the base operation name for inspection mapping.
 * @example "Sequence_Lens_Tray_Align" -> "Lens_Tray_Align"
 */
export function getBaseOperationName(sequenceName: string): string {
    return sequenceName.replace(/^Sequence_/i, '');
}

/**
 * Get inspection folder name from operation name.
 */
export function getInspectionName(operationName: string): string | undefined {
    const baseName = getBaseOperationName(operationName);
    return OPERATION_INSPECTION_MAP[baseName];
}

/**
 * Clean operation name for display (remove prefix and underscores).
 * @example "Sequence_Lens_Tray_Align" -> "Lens Tray Align"
 */
export function cleanOperationName(name: string): string {
    return getBaseOperationName(name).replace(/_/g, ' ');
}

/**
 * Extract NG (failure) info from JSON data.
 * NG is indicated by presence of a reason string in the JSON.
 */
function extractNGInfo(jsonData: Record<string, unknown>): {
    isNG: boolean;
    ngReason?: string
} {
    const knownFields = ['modelName', 'trayId', 'barrelId', 'startTs', 'endTs', 'idealMs', 'reason', 'lensTrayId'];

    for (const key of Object.keys(jsonData)) {
        if (!knownFields.includes(key)) {
            // Found an unknown key - this might be the NG reason
            const value = jsonData[key];
            if (typeof value === 'string') {
                return { isNG: true, ngReason: value };
            }
            // Or the key itself might be the reason
            if (value === undefined || value === null || value === '') {
                return { isNG: true, ngReason: key };
            }
        }
    }

    // Check for explicit "reason" field
    if (typeof jsonData.reason === 'string') {
        return { isNG: true, ngReason: jsonData.reason };
    }

    return { isNG: false };
}

// =============================================================================
// MAIN PARSER FUNCTION
// =============================================================================

/**
 * Parse raw log file content into structured analysis result.
 * 
 * @param content - Raw log file content (tab-separated lines)
 * @param fileName - Optional file name for reference
 * @returns Parsed analysis result with barrels, tray loads, operations, and summary
 */
export function parseLogContent(content: string, fileName?: string): AnalysisResult {
    const lines = content.trim().split('\n');

    const barrelMap = new Map<number, {
        operations: Map<string, Partial<OperationData>>;
        sequenceOrder: string[];
    }>();

    // Tray load tracking
    const trayLoadMap = new Map<string, {
        lensTrayId: string;
        barrelId: string;
        startTime?: number;
        endTime?: number;
        subOperations: Map<string, Partial<TrayLoadSubOperation>>;
        subOpOrder: string[];
    }>();

    // Parse each line
    for (const line of lines) {
        const parts = line.split('\t');

        if (parts.length < 11) continue;

        const logType = parts[7];    // 'Sequence', 'NGImage', or 'Sequence_Load_Tray'
        const sequenceName = parts[8];
        const event = parts[9] as 'START' | 'END' | 'SET' | 'NG';
        const jsonData = parts[10];

        // Skip completion time SET lines
        if (event === 'SET') continue;

        let data: Record<string, unknown>;
        try {
            data = JSON.parse(jsonData.replace(/\r$/, ''));
        } catch {
            continue;
        }

        const barrelId = data.barrelId as number | undefined;
        if (barrelId === undefined) continue;

        const trayId = data.trayId as number | undefined;
        const lensTrayId = data.lensTrayId as number | undefined;

        // =================================================================
        // CASE 1: Sub-operations of Sequence_Load_Tray
        // logType = 'Sequence_Load_Tray', sequenceName = sub-op name
        // =================================================================
        if (logType === 'Sequence_Load_Tray') {
            if (lensTrayId === undefined) continue;

            const trayLoadKey = `${barrelId}_${lensTrayId}`;

            if (!trayLoadMap.has(trayLoadKey)) {
                trayLoadMap.set(trayLoadKey, {
                    lensTrayId: lensTrayId.toString(),
                    barrelId: barrelId.toString(),
                    subOperations: new Map(),
                    subOpOrder: []
                });
            }

            const trayLoad = trayLoadMap.get(trayLoadKey)!;

            if (!trayLoad.subOperations.has(sequenceName)) {
                trayLoad.subOperations.set(sequenceName, {
                    operationName: sequenceName,
                    lensTrayId: lensTrayId.toString(),
                    barrelId: barrelId.toString()
                });
                trayLoad.subOpOrder.push(sequenceName);
            }

            const subOp = trayLoad.subOperations.get(sequenceName)!;

            if (event === 'START') {
                subOp.startTime = (data.startTs as number) ?? 0;
            } else if (event === 'END') {
                subOp.endTime = (data.endTs as number) ?? 0;
                subOp.idealDuration = (data.idealMs as number) ?? 100;
                if (subOp.startTime !== undefined) {
                    subOp.actualDuration = subOp.endTime - subOp.startTime;
                }
            }
            continue;
        }

        // =================================================================
        // CASE 2: Sequence_Load_Tray START/END as a barrel-level operation
        // logType = 'Sequence', sequenceName = 'Sequence_Load_Tray'
        // =================================================================
        if (logType === 'Sequence' && sequenceName === 'Sequence_Load_Tray') {
            // Track tray load start/end times
            if (lensTrayId !== undefined) {
                const trayLoadKey = `${barrelId}_${lensTrayId}`;

                if (!trayLoadMap.has(trayLoadKey)) {
                    trayLoadMap.set(trayLoadKey, {
                        lensTrayId: lensTrayId.toString(),
                        barrelId: barrelId.toString(),
                        subOperations: new Map(),
                        subOpOrder: []
                    });
                }

                const trayLoad = trayLoadMap.get(trayLoadKey)!;

                if (event === 'START') {
                    trayLoad.startTime = (data.startTs as number) ?? 0;
                } else if (event === 'END') {
                    trayLoad.endTime = (data.endTs as number) ?? 0;
                }
            }

            // Also add as a barrel-level operation (so it shows in gantt)
            // Fall through to normal barrel processing below
        }

        // =================================================================
        // CASE 3: Normal barrel-level operations (Sequence type)
        // =================================================================

        // Initialize barrel if needed
        if (!barrelMap.has(barrelId)) {
            barrelMap.set(barrelId, {
                operations: new Map(),
                sequenceOrder: []
            });
        }

        const barrel = barrelMap.get(barrelId)!;

        // Handle NGImage type - map imagePath to existing operation
        if (logType === 'NGImage') {
            const operation = barrel.operations.get(sequenceName);
            if (operation && data.imagePath) {
                operation.isNG = true;
                operation.imagePath = data.imagePath as string;
                if (data.ngReason) {
                    operation.ngReason = data.ngReason as string;
                }
            }
            continue;
        }

        // Handle Sequence type
        // Get or create operation
        if (!barrel.operations.has(sequenceName)) {
            barrel.operations.set(sequenceName, {
                operationName: sequenceName,
                sequence: barrel.sequenceOrder.length + 1,
                barrelId: barrelId.toString(),
                trayId: trayId?.toString(),
                lensTrayId: lensTrayId?.toString()
            });
            barrel.sequenceOrder.push(sequenceName);
        }

        const operation = barrel.operations.get(sequenceName)!;

        // Store trayId if present
        if (trayId !== undefined) {
            operation.trayId = trayId.toString();
        }
        if (lensTrayId !== undefined) {
            operation.lensTrayId = lensTrayId.toString();
        }

        if (event === 'START') {
            const ts = (data.startTs as number) ?? 0;
            operation.startTime = ts;
            operation.globalStartTime = ts;
        } else if (event === 'END') {
            const ts = (data.endTs as number) ?? 0;
            operation.endTime = ts;
            operation.globalEndTime = ts;
            operation.idealDuration = (data.idealMs as number) ?? 1000;

            if (operation.globalStartTime !== undefined) {
                operation.actualDuration = ts - operation.globalStartTime;
            }

            // Extract NG inspection data on END event
            const ngInfo = extractNGInfo(data);
            if (ngInfo.isNG) {
                operation.isNG = true;
                operation.ngReason = ngInfo.ngReason;
                operation.modelName = data.modelName?.toString();
                operation.trayId = data.trayId?.toString();
                operation.inspectionName = getInspectionName(sequenceName);
            }
        }
    }

    // Convert to BarrelExecutionData array
    const barrels: BarrelExecutionData[] = [];

    for (const [barrelId, barrelData] of barrelMap.entries()) {
        const operations: OperationData[] = [];

        for (const op of barrelData.operations.values()) {
            if (op.globalStartTime !== undefined &&
                op.globalEndTime !== undefined &&
                op.actualDuration !== undefined &&
                op.idealDuration !== undefined &&
                op.operationName !== undefined &&
                op.sequence !== undefined) {

                // Ensure normalized copies exist
                op.startTime = op.globalStartTime;
                op.endTime = op.globalEndTime;

                operations.push(op as OperationData);
            }
        }

        // Sort by start time
        operations.sort((a, b) => a.globalStartTime - b.globalStartTime);

        // NORMALIZE: Find the minimum start time for this barrel
        const minStartTime = operations.length > 0 ? operations[0].startTime : 0;

        // Adjust relative times to start from 0
        operations.forEach(op => {
            op.startTime = op.startTime - minStartTime;
            op.endTime = op.endTime - minStartTime;
        });

        // Calculate total execution time
        let totalExecutionTime = 0;

        if (operations.length > 0) {
            const startFirst = operations[0].startTime;
            const endLast = Math.max(...operations.map(op => op.endTime));
            const totalWallTime = endLast - startFirst;

            // Calculate waiting time for Lens_Tray_Align
            let lensTrayAlignWaitTime = 0;
            const lensTrayAlignOp = operations.find(op =>
                op.operationName === 'Sequence_Lens_Tray_Align'
            );

            if (lensTrayAlignOp) {
                const lensTrayEndTime = lensTrayAlignOp.endTime;
                const anyOtherRunning = operations.some(other =>
                    other.operationName !== 'Sequence_Lens_Tray_Align' &&
                    other.startTime < lensTrayEndTime &&
                    other.endTime > lensTrayEndTime
                );

                if (!anyOtherRunning) {
                    const nextOp = operations.find(other =>
                        other.startTime >= lensTrayEndTime &&
                        other.operationName !== 'Sequence_Lens_Tray_Align'
                    );
                    if (nextOp) {
                        lensTrayAlignWaitTime = nextOp.startTime - lensTrayEndTime;
                    }
                }
            }

            totalExecutionTime = totalWallTime - lensTrayAlignWaitTime;
        }

        barrels.push({
            barrelId: barrelId.toString(),
            totalExecutionTime,
            operations
        });
    }

    // Sort barrels by ID numerically
    barrels.sort((a, b) => parseInt(a.barrelId) - parseInt(b.barrelId));

    // Build TrayLoadData array
    const trayLoads: TrayLoadData[] = [];

    for (const trayLoad of trayLoadMap.values()) {
        const subOperations: TrayLoadSubOperation[] = [];

        for (const subOp of trayLoad.subOperations.values()) {
            if (subOp.startTime !== undefined &&
                subOp.endTime !== undefined &&
                subOp.actualDuration !== undefined &&
                subOp.idealDuration !== undefined &&
                subOp.operationName !== undefined) {
                subOperations.push(subOp as TrayLoadSubOperation);
            }
        }

        // Sort sub-operations by start time
        subOperations.sort((a, b) => a.startTime - b.startTime);

        const startTime = trayLoad.startTime ?? (subOperations.length > 0 ? subOperations[0].startTime : 0);
        const endTime = trayLoad.endTime ?? (subOperations.length > 0 ? subOperations[subOperations.length - 1].endTime : 0);

        trayLoads.push({
            lensTrayId: trayLoad.lensTrayId,
            barrelId: trayLoad.barrelId,
            startTime,
            endTime,
            totalDuration: endTime - startTime,
            subOperations
        });
    }

    // Sort tray loads by lens tray ID numerically
    trayLoads.sort((a, b) => parseInt(a.lensTrayId) - parseInt(b.lensTrayId));

    // Calculate summary statistics
    const executionTimes = barrels.map(b => b.totalExecutionTime);
    const summary = {
        totalBarrels: barrels.length,
        averageExecutionTime: executionTimes.length > 0
            ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
            : 0,
        minExecutionTime: executionTimes.length > 0
            ? Math.min(...executionTimes)
            : 0,
        maxExecutionTime: executionTimes.length > 0
            ? Math.max(...executionTimes)
            : 0
    };

    return { barrels, trayLoads, summary, rawContent: content, fileName };
}

export default parseLogContent;
