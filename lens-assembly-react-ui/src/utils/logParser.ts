import type { AnalysisResult, BarrelExecutionData, OperationData } from '../types/logTypes';
import { OPERATION_INSPECTION_MAP } from '../types/logTypes';

function getBaseOperationName(sequenceName: string): string {
    return sequenceName.replace(/^Sequence_/i, '');
}

function getInspectionName(operationName: string): string | undefined {
    const baseName = getBaseOperationName(operationName);
    return OPERATION_INSPECTION_MAP[baseName];
}

function extractNGInfo(jsonData: any): { isNG: boolean; ngReason?: string } {

    const knownFields = ['modelName', 'trayId', 'barrelId', 'startTs', 'endTs', 'idealMs', 'reason'];

    for (const key of Object.keys(jsonData)) {
        if (!knownFields.includes(key)) {

            if (typeof jsonData[key] === 'string') {
                return { isNG: true, ngReason: jsonData[key] };
            }
            
            if (jsonData[key] === undefined || jsonData[key] === null || jsonData[key] === '') {
                return { isNG: true, ngReason: key };
            }
        }
    }

    if (jsonData.reason && typeof jsonData.reason === 'string') {
        return { isNG: true, ngReason: jsonData.reason };
    }

    return { isNG: false };
}

export function parseLogContent(content: string, fileName?: string): AnalysisResult {
    const lines = content.trim().split('\n');

    const barrelMap = new Map<number, {
        operations: Map<string, Partial<OperationData>>;
        sequenceOrder: string[];
    }>();

    for (const line of lines) {
        const parts = line.split('\t');

        if (parts.length < 11) continue;

        const logType = parts[7];    
        const sequenceName = parts[8];
        const event = parts[9] as 'START' | 'END' | 'NG';
        const jsonData = parts[10];

        let data;
        try {
            data = JSON.parse(jsonData);
        } catch {
            continue;
        }

        const barrelId = data.barrelId;
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
                operation.imagePath = data.imagePath;
                
                if (data.ngReason) {
                    operation.ngReason = data.ngReason;
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
            const ts = data.startTs ?? 0;
            operation.startTime = ts;       
            operation.globalStartTime = ts; 
        } else if (event === 'END') {
            const ts = data.endTs ?? 0;
            operation.endTime = ts;         
            operation.globalEndTime = ts;   
            operation.idealDuration = data.idealMs ?? 1000;

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

    return { barrels, trayLoads: [], summary, rawContent: content, fileName };
}