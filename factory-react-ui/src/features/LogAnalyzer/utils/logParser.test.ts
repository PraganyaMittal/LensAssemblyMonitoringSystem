
import { describe, it, expect } from 'vitest';
import { parseLogContent, getBaseOperationName, cleanOperationName } from './logParser';

describe('logParser', () => {
    describe('getBaseOperationName', () => {
        it('should remove Sequence_ prefix', () => {
            expect(getBaseOperationName('Sequence_Lens_Tray_Align')).toBe('Lens_Tray_Align');
        });

        it('should handle names without prefix', () => {
            expect(getBaseOperationName('Lens_Tray_Align')).toBe('Lens_Tray_Align');
        });

        it('should be case insensitive for prefix', () => {
            expect(getBaseOperationName('sequence_Test')).toBe('Test');
        });
    });

    describe('cleanOperationName', () => {
        it('should remove prefix and replace underscores with spaces', () => {
            expect(cleanOperationName('Sequence_Lens_Tray_Align')).toBe('Lens Tray Align');
        });
    });

    describe('parseLogContent', () => {
        it('should return empty result for empty content', () => {
            const result = parseLogContent('');
            expect(result.barrels).toHaveLength(0);
            expect(result.summary.totalBarrels).toBe(0);
        });

        it('should parse valid log lines', () => {
            const logContent = `2024-01-01\t12:00:00\t000\tINFO\tMachine1\tLine1\tPC1\tSequence\tSequence_Test_Op\tSTART\t{"barrelId":1,"startTs":1000}
2024-01-01\t12:00:01\t001\tINFO\tMachine1\tLine1\tPC1\tSequence\tSequence_Test_Op\tEND\t{"barrelId":1,"endTs":2000,"idealMs":1000}`;

            const result = parseLogContent(logContent, 'test.log');

            expect(result.barrels).toHaveLength(1);
            expect(result.barrels[0].barrelId).toBe('1');
            expect(result.barrels[0].operations).toHaveLength(1);
            expect(result.barrels[0].operations[0].operationName).toBe('Sequence_Test_Op');
            expect(result.barrels[0].operations[0].actualDuration).toBe(1000);
            expect(result.fileName).toBe('test.log');
        });

        it('should handle multiple barrels', () => {
            const logContent = `2024-01-01\t12:00:00\t000\tINFO\tMachine1\tLine1\tPC1\tSequence\tSequence_Op1\tSTART\t{"barrelId":1,"startTs":1000}
2024-01-01\t12:00:00\t001\tINFO\tMachine1\tLine1\tPC1\tSequence\tSequence_Op1\tEND\t{"barrelId":1,"endTs":2000,"idealMs":1000}
2024-01-01\t12:00:00\t002\tINFO\tMachine1\tLine1\tPC1\tSequence\tSequence_Op1\tSTART\t{"barrelId":2,"startTs":3000}
2024-01-01\t12:00:00\t003\tINFO\tMachine1\tLine1\tPC1\tSequence\tSequence_Op1\tEND\t{"barrelId":2,"endTs":4000,"idealMs":1000}`;

            const result = parseLogContent(logContent);

            expect(result.barrels).toHaveLength(2);
            expect(result.summary.totalBarrels).toBe(2);
        });

        it('should handle NGImage type', () => {
            const logContent = `2024-01-01\t12:00:00\t000\tINFO\tMachine1\tLine1\tPC1\tSequence\tSequence_Lens_Align\tSTART\t{"barrelId":1,"startTs":1000}
2024-01-01\t12:00:01\t001\tINFO\tMachine1\tLine1\tPC1\tSequence\tSequence_Lens_Align\tEND\t{"barrelId":1,"endTs":2000,"idealMs":1000}
2024-01-01\t12:00:02\t002\tINFO\tMachine1\tLine1\tPC1\tNGImage\tSequence_Lens_Align\tNG\t{"barrelId":1,"imagePath":"/path/to/image.bmp"}`;

            const result = parseLogContent(logContent);

            expect(result.barrels[0].operations[0].isNG).toBe(true);
            expect(result.barrels[0].operations[0].imagePath).toBe('/path/to/image.bmp');
        });

        it('should calculate summary statistics correctly', () => {
            const logContent = `2024-01-01\t12:00:00\t000\tINFO\tMachine1\tLine1\tPC1\tSequence\tSequence_Op\tSTART\t{"barrelId":1,"startTs":0}
2024-01-01\t12:00:00\t001\tINFO\tMachine1\tLine1\tPC1\tSequence\tSequence_Op\tEND\t{"barrelId":1,"endTs":1000,"idealMs":1000}
2024-01-01\t12:00:00\t002\tINFO\tMachine1\tLine1\tPC1\tSequence\tSequence_Op\tSTART\t{"barrelId":2,"startTs":0}
2024-01-01\t12:00:00\t003\tINFO\tMachine1\tLine1\tPC1\tSequence\tSequence_Op\tEND\t{"barrelId":2,"endTs":2000,"idealMs":1000}`;

            const result = parseLogContent(logContent);

            expect(result.summary.totalBarrels).toBe(2);
            expect(result.summary.minExecutionTime).toBe(1000);
            expect(result.summary.maxExecutionTime).toBe(2000);
            expect(result.summary.averageExecutionTime).toBe(1500);
        });

        it('should skip malformed lines gracefully', () => {
            const logContent = `invalid line
2024-01-01\t12:00:00\t000\tINFO\tMachine1\tLine1\tPC1\tSequence\tSequence_Op\tSTART\t{"barrelId":1,"startTs":0}
another invalid
2024-01-01\t12:00:00\t001\tINFO\tMachine1\tLine1\tPC1\tSequence\tSequence_Op\tEND\t{"barrelId":1,"endTs":1000,"idealMs":1000}`;

            const result = parseLogContent(logContent);

            
            expect(result.barrels).toHaveLength(1);
        });
    });
});
