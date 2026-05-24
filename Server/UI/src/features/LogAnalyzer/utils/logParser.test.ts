
import { describe, it, expect } from 'vitest';
import { parseLogContent } from '../utils/logParser';

/**
 * Helper: builds a tab-separated log line in the new format.
 * Cols: timestamp, machineId, A, -, -, ProductID, IDLE, scope, operationName, eventType, jsonData
 */
function logLine(
    opName: string,
    event: 'START' | 'END' | 'SET',
    json: Record<string, unknown>,
    scope = 'Seq_Log_Analyzer'
): string {
    return [
        '2026-05-20 17:49:41.000',
        'LensAssembler3.0',
        'A', '-', '-', 'ProductID', 'IDLE',
        scope,
        opName,
        event,
        JSON.stringify(json),
    ].join('\t');
}

describe('parseLogContent (new generic format)', () => {

    it('should return empty trays for empty content', () => {
        const result = parseLogContent('');
        expect(result.trays).toHaveLength(0);
        expect(result.summary.totalBarrels).toBe(0);
    });

    it('should parse a single barrel with one operation', () => {
        const lines = [
            logLine('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 100 }),
            logLine('Sequence_Lens_Pickup', 'END', { barrelTrayId: 'T1', lensId: 0, endTs: 200, idealMs: 150 }),
            logLine('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
        ];

        const result = parseLogContent(lines.join('\n'));
        expect(result.trays).toHaveLength(1);
        expect(result.trays[0].barrels).toHaveLength(1);

        const barrel = result.trays[0].barrels[0];
        expect(barrel.barrelId).toBe(0);
        expect(barrel.operations).toHaveLength(1);
        expect(barrel.operations[0].operationName).toBe('Sequence_Lens_Pickup');
        expect(barrel.operations[0].duration).toBe(100);
        expect(barrel.operations[0].counterType).toBe('lensId');
    });

    it('should map operations to correct barrels via range ownership', () => {
        const lines = [
            // Barrel 0: lensId 0-1, spacerId 0-1
            logLine('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            logLine('Sequence_Lens_Pickup', 'END', { barrelTrayId: 'T1', lensId: 0, endTs: 100, idealMs: 100 }),
            logLine('Sequence_Spacer_Pickup', 'START', { barrelTrayId: 'T1', spacerId: 0, startTs: 50 }),
            logLine('Sequence_Spacer_Pickup', 'END', { barrelTrayId: 'T1', spacerId: 0, endTs: 150, idealMs: 100 }),
            logLine('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 200 }),
            logLine('Sequence_Barrel_Align_Lens', 'END', { barrelTrayId: 'T1', barrelId: 0, endTs: 300, idealMs: 100 }),
            logLine('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),

            // Barrel 1: lensId 1-1, spacerId 1-1
            logLine('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 1, startTs: 300 }),
            logLine('Sequence_Lens_Pickup', 'END', { barrelTrayId: 'T1', lensId: 1, endTs: 400, idealMs: 100 }),
            logLine('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 1, lensId: 1, spacerId: 0 }),
        ];

        const result = parseLogContent(lines.join('\n'));
        expect(result.trays).toHaveLength(1);

        const tray = result.trays[0];
        expect(tray.barrels).toHaveLength(2);

        // Barrel 0 should have 3 ops (lens 0, spacer 0, barrel_align 0)
        expect(tray.barrels[0].operations).toHaveLength(3);
        expect(tray.barrels[0].lensRange).toEqual([0, 0]);
        expect(tray.barrels[0].spacerRange).toEqual([0, 0]);

        // Barrel 1 should have 1 op (lens 1)
        expect(tray.barrels[1].operations).toHaveLength(1);
        expect(tray.barrels[1].lensRange).toEqual([1, 1]);
    });

    it('should handle NG on any operation', () => {
        const lines = [
            logLine('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            logLine('Sequence_Lens_Pickup', 'END', { barrelTrayId: 'T1', lensId: 0, endTs: 100, idealMs: 100 }),
            logLine('Sequence_Lens_Pickup', 'SET', { barrelTrayId: 'T1', lensId: 0, ngPath: 'C:\\img\\fail.bmp', ngCode: 'No lens' }),
            logLine('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
        ];

        const result = parseLogContent(lines.join('\n'));
        const op = result.trays[0].barrels[0].operations[0];
        expect(op.isNg).toBe(true);
        expect(op.ngPath).toBe('C:\\img\\fail.bmp');
        expect(op.ngCode).toBe('No lens');
    });

    it('should parse sub-operations with /-delimited names', () => {
        const lines = [
            logLine('Sequence_Load_Tray/Magazine_Run', 'START', { barrelTrayId: 'T1', lensTrayId: 0, startTs: 0 }),
            logLine('Sequence_Load_Tray/Magazine_Run', 'END', { barrelTrayId: 'T1', lensTrayId: 0, endTs: 100, idealMs: 100 }),
        ];

        const result = parseLogContent(lines.join('\n'));
        const tray = result.trays[0];
        // Should be a tray-level operation (lensTrayId counter)
        expect(tray.trayOperations).toHaveLength(1);
        expect(tray.trayOperations[0].hierarchy).toEqual(['Sequence_Load_Tray', 'Magazine_Run']);
    });

    it('should discover all operation names for settings modal', () => {
        const lines = [
            logLine('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            logLine('Sequence_Lens_Pickup', 'END', { barrelTrayId: 'T1', lensId: 0, endTs: 100, idealMs: 100 }),
            logLine('Sequence_Spacer_Pickup', 'START', { barrelTrayId: 'T1', spacerId: 0, startTs: 50 }),
            logLine('Sequence_Spacer_Pickup', 'END', { barrelTrayId: 'T1', spacerId: 0, endTs: 150, idealMs: 100 }),
            logLine('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
        ];

        const result = parseLogContent(lines.join('\n'));
        expect(result.allOperationNames).toContain('Sequence_Lens_Pickup');
        expect(result.allOperationNames).toContain('Sequence_Spacer_Pickup');
    });

    it('should mark tray as incomplete when no Barrel_Complete receipts', () => {
        const lines = [
            logLine('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            logLine('Sequence_Lens_Pickup', 'END', { barrelTrayId: 'T1', lensId: 0, endTs: 100, idealMs: 100 }),
        ];

        const result = parseLogContent(lines.join('\n'));
        expect(result.trays[0].isIncomplete).toBe(true);
        expect(result.trays[0].barrels).toHaveLength(0);
        expect(result.trays[0].trayOperations).toHaveLength(1);
    });

    it('should handle multi-tray parsing', () => {
        const lines = [
            logLine('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 0 }),
            logLine('Sequence_Barrel_Align_Lens', 'END', { barrelTrayId: 'T1', barrelId: 0, endTs: 100, idealMs: 100 }),
            logLine('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),

            logLine('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T2', barrelId: 0, startTs: 500 }),
            logLine('Sequence_Barrel_Align_Lens', 'END', { barrelTrayId: 'T2', barrelId: 0, endTs: 600, idealMs: 100 }),
            logLine('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T2', barrelId: 0, lensId: 1, spacerId: 1 }),
        ];

        const result = parseLogContent(lines.join('\n'));
        expect(result.trays).toHaveLength(2);
        expect(result.summary.totalTrays).toBe(2);
        expect(result.summary.totalBarrels).toBe(2);
    });

    it('should track barrelAlignStartTs for vertical marker line', () => {
        const lines = [
            logLine('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            logLine('Sequence_Lens_Pickup', 'END', { barrelTrayId: 'T1', lensId: 0, endTs: 100, idealMs: 100 }),
            logLine('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 200 }),
            logLine('Sequence_Barrel_Align_Lens', 'END', { barrelTrayId: 'T1', barrelId: 0, endTs: 300, idealMs: 100 }),
            logLine('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
        ];

        const result = parseLogContent(lines.join('\n'));
        // barrelAlignStartTs should be 200 (from the barrel-direct operation)
        expect(result.trays[0].barrels[0].barrelAlignStartTs).toBe(200);
    });
});
