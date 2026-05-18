
import { describe, it, expect } from 'vitest';
import {
    LogFileNodeSchema,
    LogFileContentSchema,
    OperationDataSchema,
    validateApiResponse,
    validateWithFallback,
} from './log.schemas';

describe('log.schemas', () => {
    describe('LogFileNodeSchema', () => {
        it('should validate a simple file node', () => {
            const node = {
                name: 'test.log',
                path: '/logs/test.log',
                isDirectory: false,
            };

            const result = LogFileNodeSchema.safeParse(node);
            expect(result.success).toBe(true);
        });

        it('should validate a directory node with children', () => {
            const node = {
                name: '2024',
                path: '/logs/2024',
                isDirectory: true,
                children: [
                    { name: 'January', path: '/logs/2024/January', isDirectory: true },
                ],
            };

            const result = LogFileNodeSchema.safeParse(node);
            expect(result.success).toBe(true);
        });

        it('should handle optional fields', () => {
            const node = {
                name: '2026051814.log',
                path: '2026/05/18/2026051814.log',
                isDirectory: false,
                size: 1024,
                // Note: modifiedDate removed — filename encodes year/month/day/hour
            };

            const result = LogFileNodeSchema.safeParse(node);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.size).toBe(1024);
            }
        });

        it('should reject invalid data', () => {
            const invalid = {
                name: 123, 
                path: '/logs',
                isDirectory: false,
            };

            const result = LogFileNodeSchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });
    });

    describe('LogFileContentSchema', () => {
        it('should validate valid content', () => {
            const content = {
                fileName: 'test.log',
                filePath: '/logs/test.log',
                content: 'log content here',
                size: 100,
                encoding: 'utf-8',
            };

            const result = LogFileContentSchema.safeParse(content);
            expect(result.success).toBe(true);
        });
    });

    describe('OperationDataSchema', () => {
        it('should validate complete operation data', () => {
            const operation = {
                operationName: 'Sequence_Test',
                startTime: 0,
                endTime: 1000,
                globalStartTime: 5000,
                globalEndTime: 6000,
                actualDuration: 1000,
                idealDuration: 900,
                sequence: 1,
                barrelId: '1',
            };

            const result = OperationDataSchema.safeParse(operation);
            expect(result.success).toBe(true);
        });

        it('should handle optional NG fields', () => {
            const operation = {
                operationName: 'Sequence_Test',
                startTime: 0,
                endTime: 1000,
                globalStartTime: 5000,
                globalEndTime: 6000,
                actualDuration: 1000,
                idealDuration: 900,
                sequence: 1,
                barrelId: '1',
                isNG: true,
                ngReason: 'Lens tilted',
                imagePath: '/path/to/image.bmp',
            };

            const result = OperationDataSchema.safeParse(operation);
            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.isNG).toBe(true);
                expect(result.data.ngReason).toBe('Lens tilted');
            }
        });
    });

    describe('validateApiResponse', () => {
        it('should return parsed data on success', () => {
            const data = {
                fileName: 'test.log',
                filePath: '/logs/test.log',
                content: 'content',
                size: 100,
                encoding: 'utf-8',
            };

            const result = validateApiResponse(LogFileContentSchema, data, 'test');
            expect(result.fileName).toBe('test.log');
        });

        it('should throw on invalid data', () => {
            const invalid = { invalid: 'data' };

            expect(() => {
                validateApiResponse(LogFileContentSchema, invalid, 'test');
            }).toThrow();
        });
    });

    describe('validateWithFallback', () => {
        it('should return parsed data on success', () => {
            const data = {
                fileName: 'test.log',
                filePath: '/logs/test.log',
                content: 'content',
                size: 100,
                encoding: 'utf-8',
            };

            const result = validateWithFallback(LogFileContentSchema, data, 'test');
            expect(result.fileName).toBe('test.log');
        });

        it('should return original data on validation failure', () => {
            const invalid = { fileName: 'test.log', extra: 'field' };

            const result = validateWithFallback(LogFileContentSchema, invalid, 'test');
            expect(result).toEqual(invalid);
        });
    });
});
