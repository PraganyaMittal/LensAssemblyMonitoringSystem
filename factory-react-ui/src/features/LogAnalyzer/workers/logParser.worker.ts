/**
 * Log Parser Web Worker
 * 
 * Offloads heavy log parsing (15-30MB files) to a background thread
 * to prevent blocking the main UI thread.
 * 
 * Message Protocol:
 * - Request: { type: 'parse', content: string, fileName?: string }
 * - Response: { type: 'success', result: AnalysisResult } | { type: 'error', error: string }
 * - Progress: { type: 'progress', percent: number, message: string }
 */

// Import types only (actual implementation is self-contained)
import type { AnalysisResult, BarrelExecutionData, OperationData } from '../types/log.schemas';

// =============================================================================
// PARSER IMPLEMENTATION (Duplicated here for worker isolation)
// =============================================================================

const OPERATION_INSPECTION_MAP: Record<string, string> = {
    'Lens_Tray_Align': 'Lens_Tray_Align',
    'Model_Lens_Align': 'Model_Lens_Align',
    'Model_Frame_Align': 'Model_Frame_Align',
    'Model_UV_Inspect': 'Model_UV_Inspect',
    'Lens_Align': 'Lens_Align',
    'Frame_Align': 'Frame_Align',
    'UV_Inspect': 'UV_Inspect',
    'Final_Inspect': 'Final_Inspect',
};

function getBaseOperationName(sequenceName: string): string {
    return sequenceName.replace(/^Sequence_/i, '');
}

function getInspectionName(operationName: string): string | undefined {
    const baseName = getBaseOperationName(operationName);
    return OPERATION_INSPECTION_MAP[baseName];
}

function extractNGInfo(jsonData: Record<string, unknown>): {
    isNG: boolean;
    ngReason?: string
} {
    const knownFields = ['modelName', 'trayId', 'barrelId', 'startTs', 'endTs', 'idealMs', 'reason'];

    for (const key of Object.keys(jsonData)) {
        if (!knownFields.includes(key)) {
            const value = jsonData[key];
            if (typeof value === 'string') {
                return { isNG: true, ngReason: value };
            }
            if (value === undefined || value === null || value === '') {
                return { isNG: true, ngReason: key };
            }
        }
    }

    if (typeof jsonData.reason === 'string') {
        return { isNG: true, ngReason: jsonData.reason };
    }

    return { isNG: false };
}

function parseLogContent(content: string, fileName?: string): AnalysisResult {
    const lines = content.trim().split('\n');
    const totalLines = lines.length;

    // Report initial progress
    self.postMessage({ type: 'progress', percent: 0, message: `Parsing ${totalLines.toLocaleString()} lines...` });

    const barrelMap = new Map<number, {
        operations: Map<string, Partial<OperationData>>;
        sequenceOrder: string[];
    }>();

    // Parse each line with progress reporting
    for (let i = 0; i < lines.length; i++) {
        // Report progress every 10000 lines
        if (i > 0 && i % 10000 === 0) {
            const percent = Math.floor((i / totalLines) * 70); // 0-70% for parsing
            self.postMessage({ type: 'progress', percent, message: `Parsed ${i.toLocaleString()} / ${totalLines.toLocaleString()} lines` });
        }

        const line = lines[i];
        const parts = line.split('\t');

        if (parts.length < 11) continue;

        const logType = parts[7];
        const sequenceName = parts[8];
        const event = parts[9] as 'START' | 'END' | 'NG';
        const jsonData = parts[10];

        let data: Record<string, unknown>;
        try {
            data = JSON.parse(jsonData);
        } catch {
            continue;
        }

        const barrelId = data.barrelId as number | undefined;
        if (barrelId === undefined) continue;

        if (!barrelMap.has(barrelId)) {
            barrelMap.set(barrelId, {
                operations: new Map(),
                sequenceOrder: []
            });
        }

        const barrel = barrelMap.get(barrelId)!;

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

        if (!barrel.operations.has(sequenceName)) {
            barrel.operations.set(sequenceName, {
                operationName: sequenceName,
                sequence: barrel.sequenceOrder.length + 1,
                barrelId: barrelId.toString()
            });
            barrel.sequenceOrder.push(sequenceName);
        }

        const operation = barrel.operations.get(sequenceName)!;

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

    self.postMessage({ type: 'progress', percent: 75, message: 'Building barrel data...' });

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

                op.startTime = op.globalStartTime;
                op.endTime = op.globalEndTime;

                operations.push(op as OperationData);
            }
        }

        operations.sort((a, b) => a.globalStartTime - b.globalStartTime);

        const minStartTime = operations.length > 0 ? operations[0].startTime : 0;

        operations.forEach(op => {
            op.startTime = op.startTime - minStartTime;
            op.endTime = op.endTime - minStartTime;
        });

        let totalExecutionTime = 0;

        if (operations.length > 0) {
            const startFirst = operations[0].startTime;
            const endLast = Math.max(...operations.map(op => op.endTime));
            const totalWallTime = endLast - startFirst;

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

    self.postMessage({ type: 'progress', percent: 90, message: 'Calculating statistics...' });

    barrels.sort((a, b) => parseInt(a.barrelId) - parseInt(b.barrelId));

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

    self.postMessage({ type: 'progress', percent: 100, message: 'Complete!' });

    return { barrels, summary, rawContent: content, fileName };
}

// =============================================================================
// WORKER MESSAGE HANDLER
// =============================================================================

self.onmessage = (event: MessageEvent) => {
    const { type, content, fileName } = event.data;

    if (type === 'parse') {
        try {
            const result = parseLogContent(content, fileName);
            self.postMessage({ type: 'success', result });
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown parsing error';
            self.postMessage({ type: 'error', error: errorMessage });
        }
    }
};

// Export empty object for TypeScript module resolution
export { };
