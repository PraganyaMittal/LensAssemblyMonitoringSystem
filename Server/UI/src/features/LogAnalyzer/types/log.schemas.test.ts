
import { describe, it, expect } from 'vitest';
import {
    OperationDataSchema,
    BarrelSchema,
    BarrelTraySchema,
    AnalysisResultSchema,
    BarrelReceiptSchema,
    InspectionImageRequestSchema,
} from './log.schemas';

describe('Zod Schemas (new generic format)', () => {

    it('should validate BarrelReceipt', () => {
        const data = { barrelId: 0, lensId: 5, spacerId: 3 };
        expect(BarrelReceiptSchema.safeParse(data).success).toBe(true);
    });

    it('should validate OperationData', () => {
        const data = {
            operationName: 'Sequence_Lens_Pickup',
            hierarchy: ['Sequence_Lens_Pickup'],
            counterType: 'lensId' as const,
            counterId: 0,
            startTs: 100,
            endTs: 200,
            duration: 100,
            barrelTrayId: '20260520_174941',
            isNg: false,
        };
        expect(OperationDataSchema.safeParse(data).success).toBe(true);
    });

    it('should validate OperationData with NG fields', () => {
        const data = {
            operationName: 'Sequence_Lens_Tray_Align',
            hierarchy: ['Sequence_Lens_Tray_Align'],
            counterType: 'lensId' as const,
            counterId: 3,
            startTs: 100,
            endTs: 200,
            duration: 100,
            barrelTrayId: '20260520_174941',
            isNg: true,
            ngPath: 'C:\\LAI\\images\\FAIL.BMP',
            ngCode: 'No Lens Circle',
        };
        const result = OperationDataSchema.safeParse(data);
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.ngPath).toBe('C:\\LAI\\images\\FAIL.BMP');
            expect(result.data.ngCode).toBe('No Lens Circle');
        }
    });

    it('should validate Barrel', () => {
        const data = {
            barrelId: 0,
            barrelTrayId: '20260520_174941',
            receipt: { barrelId: 0, lensId: 2, spacerId: 1 },
            operations: [],
            lensRange: [0, 2] as [number, number],
            spacerRange: [0, 1] as [number, number],
            totalDuration: 5000,
            barrelAlignStartTs: 200,
        };
        expect(BarrelSchema.safeParse(data).success).toBe(true);
    });

    it('should validate BarrelTray', () => {
        const data = {
            barrelTrayId: '20260520_174941',
            barrels: [],
            trayOperations: [],
            totalDuration: 0,
            isIncomplete: true,
        };
        expect(BarrelTraySchema.safeParse(data).success).toBe(true);
    });

    it('should validate AnalysisResult', () => {
        const data = {
            trays: [],
            allOperationNames: ['Sequence_Lens_Pickup', 'Sequence_Spacer_Pickup'],
            summary: {
                totalTrays: 0,
                totalBarrels: 0,
                averageExecutionTime: 0,
                minExecutionTime: 0,
                maxExecutionTime: 0,
            },
        };
        expect(AnalysisResultSchema.safeParse(data).success).toBe(true);
    });

    it('should validate InspectionImageRequest with ngPath', () => {
        const data = {
            ngPath: 'C:\\LAI\\images\\fail\\',
        };
        expect(InspectionImageRequestSchema.safeParse(data).success).toBe(true);
    });
});
