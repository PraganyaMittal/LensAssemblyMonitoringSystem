import type { AnalysisResult, BarrelExecutionData, OperationData } from '../types/logTypes';

export function parseLogContent(content: string, fileName?: string): AnalysisResult {
    const lines = content.trim().split('\n');

    const barrelMap = new Map<number, {
        operations: Map<string, Partial<OperationData>>;
        sequenceOrder: string[];
    }>();

    // Parse each line
    for (const line of lines) {
        const parts = line.split('\t');

        if (parts.length < 11) continue;

        const sequenceName = parts[8];
        const event = parts[9] as 'START' | 'END';
        const jsonData = parts[10];

        let data;
        try {
            data = JSON.parse(jsonData);
        } catch {
            continue;
        }

        const barrelId = data.barrelId;
        if (barrelId === undefined) continue;

        // Initialize barrel if needed
        if (!barrelMap.has(barrelId)) {
            barrelMap.set(barrelId, {
                operations: new Map(),
                sequenceOrder: []
            });
        }

        const barrel = barrelMap.get(barrelId)!;

        // Get or create operation
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
            operation.startTime = ts;       // Temporarily store raw
            operation.globalStartTime = ts; // Store global raw
        } else if (event === 'END') {
            const ts = data.endTs ?? 0;
            operation.endTime = ts;         // Temporarily store raw
            operation.globalEndTime = ts;   // Store global raw
            operation.idealDuration = data.idealMs ?? 1000;

            if (operation.globalStartTime !== undefined) {
                operation.actualDuration = ts - operation.globalStartTime;
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
        // This creates the "0-based" view for Tab 2 (Single Barrel Analysis)
        const minStartTime = operations.length > 0 ? operations[0].startTime : 0;

        // Adjust relative times to start from 0
        operations.forEach(op => {
            op.startTime = op.startTime - minStartTime;
            op.endTime = op.endTime - minStartTime;
        });

        // --- CALCULATE TOTAL EXECUTION TIME ---
        // Formula: (End Last - Start First) - Waiting Time after Sequence_Lens_Tray_Align
        let totalExecutionTime = 0;

        if (operations.length > 0) {
            // 1. Calculate Start Time of First Operation (Normalized, so effectively 0)
            const startFirst = operations[0].startTime;

            // 2. Calculate End Time of Last Operation (Max End Time found in the batch)
            const endLast = Math.max(...operations.map(op => op.endTime));

            // 3. Calculate Total Wall Clock Time
            const totalWallTime = endLast - startFirst;

            // 4. Calculate Waiting Time ONLY for Sequence_Lens_Tray_Align
            // Find the Lens_Tray_Align operation and calculate its waiting time
            let lensTrayAlignWaitTime = 0;

            const lensTrayAlignOp = operations.find(op =>
                op.operationName === 'Sequence_Lens_Tray_Align'
            );

            if (lensTrayAlignOp) {
                const lensTrayEndTime = lensTrayAlignOp.endTime;

                // Check if any other operation is still running when Lens_Tray_Align ends
                const anyOtherRunning = operations.some(other =>
                    other.operationName !== 'Sequence_Lens_Tray_Align' &&
                    other.startTime < lensTrayEndTime &&
                    other.endTime > lensTrayEndTime
                );

                if (!anyOtherRunning) {
                    // Find the next operation that starts after Lens_Tray_Align ends
                    const nextOp = operations.find(other =>
                        other.startTime >= lensTrayEndTime &&
                        other.operationName !== 'Sequence_Lens_Tray_Align'
                    );

                    if (nextOp) {
                        lensTrayAlignWaitTime = nextOp.startTime - lensTrayEndTime;
                    }
                }
            }

            // 5. Apply Formula: Wall Time - Only Lens_Tray_Align waiting time
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

    return { barrels, summary, rawContent: content, fileName };
}