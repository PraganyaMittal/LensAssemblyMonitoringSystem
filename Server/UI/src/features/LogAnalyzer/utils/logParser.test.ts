
import { describe, it, expect } from 'vitest';
import { parseLogContent } from '../utils/logParserCore';
import type { AnalysisResult } from '../types/log.schemas';

// ─── Log Line Builder ────────────────────────────────────────────────────────
/**
 * Builds a tab-separated log line in the format the C++ logger produces.
 * Cols: timestamp, machineId, A, -, -, ProductID, IDLE, scope, operationName, eventType, jsonData
 *
 * Operation name constants (verified against SeqStepLogger.cpp and SeqBarrel.cpp):
 *   Lens ops   → lensId counter:   Sequence_Lens_Tray_Align, Sequence_Lens_Pickup, Sequence_Lens_Align, Sequence_Lens_Insert
 *   Spacer ops → spacerId counter:  Sequence_Mask_Pickup, Sequence_Mask_Align, Sequence_Mask_Insert
 *   Barrel ops → barrelId counter:  Sequence_Barrel_Align_Lens, Sequence_Barrel_Align_Mask
 *   Receipt    → barrelId+lensId+spacerId: Sequence_Barrel_Complete (SET only)
 *   Tray ops   → lensTrayId counter: Sequence_Load_Tray/..., Sequence_Pallet_In/...
 */
function L(
    opName: string,
    event: 'START' | 'END' | 'SET',
    json: Record<string, unknown>,
    ts = '2026-05-20 17:49:41.000',
): string {
    return [ts, 'LensAssembler3.0', 'A', '-', '-', 'ProductID', 'IDLE', 'Seq_Log_Analyzer', opName, event, JSON.stringify(json)].join('\t');
}

// ─── Layer 1: Structural Invariants ─────────────────────────────────────────
/**
 * Verifies mathematical truths about any parse result.
 * Called from EVERY golden case — cannot be wrong unless the test domain model is wrong.
 */
function assertInvariants(result: AnalysisResult, label: string) {
    // I-10: summary counts
    const actualBarrels = result.trays.flatMap(t => t.barrels).length;
    expect(result.summary.totalBarrels, `${label} → summary.totalBarrels mismatch`).toBe(actualBarrels);
    expect(result.summary.totalTrays, `${label} → summary.totalTrays mismatch`).toBe(result.trays.length);

    for (const tray of result.trays) {
        // I-1: barrels sorted by barrelId
        for (let i = 1; i < tray.barrels.length; i++) {
            expect(
                tray.barrels[i].barrelId,
                `${label} → barrel sort order violated at index ${i} (${tray.barrels[i - 1].barrelId} → ${tray.barrels[i].barrelId})`
            ).toBeGreaterThan(tray.barrels[i - 1].barrelId);
        }

        // I-2: NG barrels have no receipt; OK barrels have a receipt
        for (const barrel of tray.barrels) {
            if (barrel.isNg) {
                expect(barrel.receipt, `${label} → NG barrel ${barrel.barrelId} should have no receipt`).toBeUndefined();
            } else {
                expect(barrel.receipt, `${label} → OK barrel ${barrel.barrelId} should have a receipt`).toBeDefined();
            }
        }

        // I-3: No overlapping lensRanges between consecutive barrels
        for (let i = 1; i < tray.barrels.length; i++) {
            const prev = tray.barrels[i - 1];
            const curr = tray.barrels[i];
            // Ranges are inclusive [lo, hi]: prev.hi must be < curr.lo
            expect(
                prev.lensRange[1],
                `${label} → lensRange overlap: barrel ${prev.barrelId}[${prev.lensRange}] vs barrel ${curr.barrelId}[${curr.lensRange}]`
            ).toBeLessThan(curr.lensRange[0]);
        }

        // I-4: No overlapping spacerRanges between consecutive barrels (if both have spacer ops)
        for (let i = 1; i < tray.barrels.length; i++) {
            const prev = tray.barrels[i - 1];
            const curr = tray.barrels[i];
            // Only check if both have spacer ops
            const prevHasSpacer = prev.operations.some(o => o.counterType === 'spacerId');
            const currHasSpacer = curr.operations.some(o => o.counterType === 'spacerId');
            if (prevHasSpacer && currHasSpacer) {
                expect(
                    prev.spacerRange[1],
                    `${label} → spacerRange overlap between barrel ${prev.barrelId} and ${curr.barrelId}`
                ).toBeLessThan(curr.spacerRange[0]);
            }
        }

        // I-5: Every barrel op's counterId falls within the barrel's declared range
        for (const barrel of tray.barrels) {
            for (const op of barrel.operations) {
                if (op.counterType === 'lensId') {
                    expect(op.counterId, `${label} → lensId ${op.counterId} out of barrel ${barrel.barrelId} range [${barrel.lensRange}]`)
                        .toBeGreaterThanOrEqual(barrel.lensRange[0]);
                    expect(op.counterId, `${label} → lensId ${op.counterId} out of barrel ${barrel.barrelId} range [${barrel.lensRange}]`)
                        .toBeLessThanOrEqual(barrel.lensRange[1]);
                } else if (op.counterType === 'spacerId') {
                    expect(op.counterId, `${label} → spacerId ${op.counterId} out of barrel ${barrel.barrelId} range [${barrel.spacerRange}]`)
                        .toBeGreaterThanOrEqual(barrel.spacerRange[0]);
                    expect(op.counterId, `${label} → spacerId ${op.counterId} out of barrel ${barrel.barrelId} range [${barrel.spacerRange}]`)
                        .toBeLessThanOrEqual(barrel.spacerRange[1]);
                } else if (op.counterType === 'barrelId') {
                    expect(op.counterId, `${label} → barrelId op counterId mismatch in barrel ${barrel.barrelId}`)
                        .toBe(barrel.barrelId);
                }
            }
        }

        // I-6: No operation assigned to more than one barrel (uniqueness check)
        const assignedKeys = new Set<string>();
        for (const barrel of tray.barrels) {
            for (const op of barrel.operations) {
                const key = `${barrel.barrelTrayId}_${op.operationName}_${op.startTs}_${op.counterId}`;
                expect(assignedKeys.has(key), `${label} → op "${op.operationName}" counterId=${op.counterId} startTs=${op.startTs} assigned to multiple barrels`).toBe(false);
                assignedKeys.add(key);
            }
        }

        // I-7: trayOperations must only contain lensTrayId ops
        for (const op of tray.trayOperations) {
            expect(op.counterType, `${label} → tray op "${op.operationName}" should be lensTrayId`).toBe('lensTrayId');
        }

        // I-8: duration = endTs - startTs for every op
        for (const barrel of tray.barrels) {
            for (const op of barrel.operations) {
                expect(op.duration, `${label} → duration mismatch on "${op.operationName}" counterId=${op.counterId}`).toBe(op.endTs - op.startTs);
            }
        }

        // I-9: incomplete tray → 0 barrels
        if (tray.isIncomplete) {
            expect(tray.barrels.length, `${label} → incomplete tray should have 0 barrels`).toBe(0);
        }
    }
}

// ─── Realistic Assembly Sequence Builder ───────────────────────────────────────
// Generates a complete, real-world barrel sequence with all 9 operations (unless aborted early)
function buildRealisticBarrel(
    trayId: string,
    barrelId: number,
    startTs: number,
    lensStartId: number,
    spacerStartId: number,
    options: { lensNgAt?: number, maskNgAt?: number, barrelAlignLensFail?: boolean } = {}
): { lines: string[], endTs: number, nextLensId: number, nextSpacerId: number } {
    const lines: string[] = [];
    let ts = startTs;
    let lId = lensStartId;
    let sId = spacerStartId;

    const push = (op: string, type: 'START'|'END'|'SET', data: any, delay: number = 0) => {
        if (delay > 0) ts += delay;
        lines.push(L(op, type, { barrelTrayId: trayId, ...data }));
    };

    // 1. Barrel Align Lens
    push('Sequence_Barrel_Align_Lens', 'START', { barrelId, startTs: ts }, 0);
    push('Sequence_Barrel_Align_Lens', 'END', { barrelId, idealMs: 1000, endTs: ts + 1000 }, 1000);
    if (options.barrelAlignLensFail) {
        push('Sequence_Barrel_Align_Lens', 'SET', { barrelId, ngCode: "Barrel Tilted" }, 10);
        return { lines, endTs: ts, nextLensId: lId, nextSpacerId: sId };
    }

    // 2. Lens Tray Align (with optional retries)
    let lRetries = options.lensNgAt || 0;
    const startLensId = lId;
    push('Sequence_Lens_Tray_Align', 'START', { lensId: startLensId, startTs: ts }, 50);
    while (lRetries >= 0) {
        if (lRetries > 0) {
            push('Sequence_Lens_Tray_Align', 'SET', { lensId: lId, ngCode: "No Lens Circle" }, 500);
            lId++;
            lRetries--;
        } else {
            push('Sequence_Lens_Tray_Align', 'END', { lensId: lId, idealMs: 1000, endTs: ts + 900 }, 900);
            lId++;
            break;
        }
    }

    // 3. Mask Pickup
    let mRetries = options.maskNgAt || 0;
    const startMaskId = sId;
    push('Sequence_Mask_Pickup', 'START', { spacerId: startMaskId, startTs: ts }, 50);
    while (mRetries >= 0) {
        if (mRetries > 0) {
            push('Sequence_Mask_Pickup', 'SET', { spacerId: sId, ngCode: "Spacer Flipped" }, 500);
            sId++;
            mRetries--;
        } else {
            push('Sequence_Mask_Pickup', 'END', { spacerId: sId, idealMs: 1000, endTs: ts + 800 }, 800);
            sId++;
            break;
        }
    }

    const activeLens = lId - 1;
    const activeSpacer = sId - 1;

    // 4. Lens Pickup
    push('Sequence_Lens_Pickup', 'START', { lensId: activeLens, startTs: ts }, 50);
    push('Sequence_Lens_Pickup', 'END', { lensId: activeLens, idealMs: 1000, endTs: ts + 400 }, 400);

    // 5. Lens Align
    push('Sequence_Lens_Align', 'START', { lensId: activeLens, startTs: ts }, 50);
    push('Sequence_Lens_Align', 'END', { lensId: activeLens, idealMs: 1000, endTs: ts + 900 }, 900);

    // 6. Mask Align
    push('Sequence_Mask_Align', 'START', { spacerId: activeSpacer, startTs: ts }, 50);
    push('Sequence_Mask_Align', 'END', { spacerId: activeSpacer, idealMs: 1000, endTs: ts + 900 }, 900);

    // 7. Lens Insert
    push('Sequence_Lens_Insert', 'START', { lensId: activeLens, startTs: ts }, 50);
    push('Sequence_Lens_Insert', 'END', { lensId: activeLens, idealMs: 1000, endTs: ts + 1100 }, 1100);

    // 8. Barrel Align Mask
    push('Sequence_Barrel_Align_Mask', 'START', { barrelId, startTs: ts }, 50);
    push('Sequence_Barrel_Align_Mask', 'END', { barrelId, idealMs: 1000, endTs: ts + 950 }, 950);

    // 9. Mask Insert
    push('Sequence_Mask_Insert', 'START', { spacerId: activeSpacer, startTs: ts }, 50);
    push('Sequence_Mask_Insert', 'END', { spacerId: activeSpacer, idealMs: 1000, endTs: ts + 1200 }, 1200);

    // 10. Complete
    push('Sequence_Barrel_Complete', 'SET', { barrelId, lensId: activeLens, spacerId: activeSpacer }, 50);

    return { lines, endTs: ts, nextLensId: lId, nextSpacerId: sId };
}

// ─── Group A: Happy Path ─────────────────────────────────────────────────────
describe('Group A — Happy Path', () => {

    it('A-01: single tray, single barrel, realistic complete 9-op sequence', () => {
        // Trace: A full, realistic barrel assembly sequence without any errors.
        const { lines } = buildRealisticBarrel('T1', 0, 1000, 0, 0);
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'A-01');
        
        expect(result.trays).toHaveLength(1);
        const t1 = result.trays[0];
        expect(t1.barrels).toHaveLength(1);
        expect(t1.barrels[0].operations).toHaveLength(9); // All 9 ops
        expect(t1.barrels[0].lensRange).toEqual([0, 0]);
        expect(t1.barrels[0].spacerRange).toEqual([0, 0]);
        expect(t1.barrels[0].isNg).toBe(false);
    });

    it('A-02: single tray, 3 barrels, sequential IDs — correct range partitioning per barrel', () => {
        // Trace: Barrel 0 → lens=0, receipt(lens=0,spacer=0).
        //        Barrel 1 → lens=1, receipt(lens=1,spacer=1).
        //        Barrel 2 → lens=2, receipt(lens=2,spacer=2).
        // Each barrel owns exactly its own counterId.
        const lines = [
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 100, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),

            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 1, startTs: 110 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 1, endTs: 210, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 1, lensId: 1, spacerId: 1 }),

            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 2, startTs: 220 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 2, endTs: 320, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 2, lensId: 2, spacerId: 2 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'A-02');

        const { barrels } = result.trays[0];
        expect(barrels).toHaveLength(3);
        expect(barrels[0].lensRange).toEqual([0, 0]);
        expect(barrels[1].lensRange).toEqual([1, 1]);
        expect(barrels[2].lensRange).toEqual([2, 2]);
        expect(barrels[0].operations[0].counterId).toBe(0);
        expect(barrels[1].operations[0].counterId).toBe(1);
        expect(barrels[2].operations[0].counterId).toBe(2);
    });

    it('A-03: two trays with globally-incrementing IDs — ops attributed to correct tray only', () => {
        // Trace: T1 barrel 0 uses lensId=0. T2 barrel 0 uses lensId=2 (global continuation).
        // The real machine never resets lensId per tray — the counter is global across the session.
        // Each tray must get exactly its own ops with no cross-contamination.
        const lines = [
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 100, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),

            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T2', lensId: 2, startTs: 200 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T2', lensId: 2, endTs: 300, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T2', barrelId: 0, lensId: 2, spacerId: 1 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'A-03');

        expect(result.trays).toHaveLength(2);
        const t1 = result.trays.find(t => t.barrelTrayId === 'T1')!;
        const t2 = result.trays.find(t => t.barrelTrayId === 'T2')!;
        expect(t1).toBeDefined();
        expect(t2).toBeDefined();
        // Each tray has exactly 1 barrel with exactly 1 op
        expect(t1.barrels[0].operations).toHaveLength(1);
        expect(t2.barrels[0].operations).toHaveLength(1);
        // T1 op has lensId=0, T2 op has lensId=2 — no cross-contamination
        expect(t1.barrels[0].operations[0].counterId).toBe(0);
        expect(t2.barrels[0].operations[0].counterId).toBe(2);
        t1.barrels[0].operations.forEach(op => expect(op.barrelTrayId).toBe('T1'));
        t2.barrels[0].operations.forEach(op => expect(op.barrelTrayId).toBe('T2'));
    });

    it('A-04: 5 barrels — stress test range partitioning with realistic full sequences', () => {
        // Trace: 5 barrels, each with a full 9-operation realistic sequence.
        const lines: string[] = [];
        let ts = 1000;
        let lId = 0;
        let sId = 0;
        for (let i = 0; i < 5; i++) {
            const b = buildRealisticBarrel('T1', i, ts, lId, sId);
            lines.push(...b.lines);
            ts = b.endTs + 500; // 500ms delay between barrels
            lId = b.nextLensId;
            sId = b.nextSpacerId;
        }
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'A-04');

        expect(result.trays[0].barrels).toHaveLength(5);
        for (let i = 0; i < 5; i++) {
            expect(result.trays[0].barrels[i].barrelId).toBe(i);
            expect(result.trays[0].barrels[i].lensRange).toEqual([i, i]);
            expect(result.trays[0].barrels[i].spacerRange).toEqual([i, i]);
            expect(result.trays[0].barrels[i].operations).toHaveLength(9);
        }
    });
});

// ─── Group B: Operation-level NG (barrel stays OK) ──────────────────────────
describe('Group B — Operation-level NG (barrel stays OK)', () => {

    it('B-01: Sequence_Lens_Tray_Align single START/END pair with NG SET for different lens', () => {
        // From SeqLens.cpp SeqLensTopAlign():
        //   StartTime(lensId=0) → kSqLensTopAlignStart → inner steps → align fails → SetFailTime(lensId=0)
        //   → UpdateLensPickUpId() → UpdateLensId() → go back for lens=1 → align succeeds →
        //   End(kSqLensTopAlignStart) → EndTime(lensId=0, kLensTrayAlignSequence).
        // The OUTER start/end pair uses lensId=0 (the counter at the time of StartTime call).
        // The NG SET is for lensId=0, and the final END is also for lensId=0.
        // Receipt: barrel=0, lens=1 (next successful lens), so lensRange=[0,1].
        // Expected: 1 align op (lensId=0, isNg=false because the overall op completed OK).
        // The NG is tracked at op level for lensId=0 in the NG SET event.
        const lines = [
            // Outer START for lensId=0 (the counter at StartTime call)
            L('Sequence_Lens_Tray_Align', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            // Inner NG for lens=0
            L('Sequence_Lens_Tray_Align', 'SET',   { barrelTrayId: 'T1', lensId: 0, ngPath: 'C:\\ng\\0.bmp', ngCode: 'No Circle' }),
            // Outer END for lensId=0 (EndTime uses lens_top_align_counter-1 = 0)
            L('Sequence_Lens_Tray_Align', 'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 200, idealMs: 150 }),
            // Next lens (lens=1) gets picked and inserted successfully
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 1, startTs: 210 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 1, endTs: 290, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 1, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'B-01');

        const barrel = result.trays[0].barrels[0];
        expect(barrel.isNg).toBe(false);
        expect(barrel.lensRange).toEqual([0, 1]);

        // The align op for lensId=0 is NG (failed inspection) but barrel itself is OK
        const alignOp = barrel.operations.find(o => o.operationName === 'Sequence_Lens_Tray_Align');
        expect(alignOp).toBeDefined();
        expect(alignOp!.isNg).toBe(true); // has NG path
        expect(alignOp!.ngCode).toBe('No Circle');
        expect(alignOp!.counterId).toBe(0);

        // The pickup for lensId=1 (the retry lens) is OK
        const pickupOp = barrel.operations.find(o => o.operationName === 'Sequence_Lens_Pickup');
        expect(pickupOp).toBeDefined();
        expect(pickupOp!.isNg).toBe(false);
        expect(pickupOp!.counterId).toBe(1);
    });

    it('B-02: Sequence_Lens_Tray_Align — 2 consecutive barrels each with 1 NG before success', () => {
        // Trace: barrel 0: Lens_Tray_Align fails for lens=0 (NG SET), succeeds overall at lens=0 (same outer op).
        //        barrel 1: Lens_Tray_Align immediately succeeds at lens=1.
        // Receipt: barrel=0 lensId=0, barrel=1 lensId=1.
        // Expected: 2 barrels, each with 1 Lens_Tray_Align op.
        //   barrel 0's align op isNg=true (has NG path but outer cycle completed → stored as NG op).
        //   barrel 1's align op isNg=false.
        const lines = [
            // Barrel 0 — align NG then continues OK
            L('Sequence_Lens_Tray_Align', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            L('Sequence_Lens_Tray_Align', 'SET',   { barrelTrayId: 'T1', lensId: 0, ngPath: 'C:\\ng\\0.bmp', ngCode: 'Align Error' }),
            L('Sequence_Lens_Tray_Align', 'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 200, idealMs: 150 }),
            L('Sequence_Barrel_Complete', 'SET',   { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
            // Barrel 1 — align succeeds
            L('Sequence_Lens_Tray_Align', 'START', { barrelTrayId: 'T1', lensId: 1, startTs: 210 }),
            L('Sequence_Lens_Tray_Align', 'END',   { barrelTrayId: 'T1', lensId: 1, endTs: 350, idealMs: 150 }),
            L('Sequence_Barrel_Complete', 'SET',   { barrelTrayId: 'T1', barrelId: 1, lensId: 1, spacerId: 1 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'B-02');

        const { barrels } = result.trays[0];
        expect(barrels).toHaveLength(2);
        expect(barrels[0].lensRange).toEqual([0, 0]);
        expect(barrels[1].lensRange).toEqual([1, 1]);

        const b0AlignOp = barrels[0].operations.find(o => o.operationName === 'Sequence_Lens_Tray_Align');
        const b1AlignOp = barrels[1].operations.find(o => o.operationName === 'Sequence_Lens_Tray_Align');
        expect(b0AlignOp!.isNg).toBe(true);
        expect(b0AlignOp!.ngCode).toBe('Align Error');
        expect(b1AlignOp!.isNg).toBe(false);
    });

    it('B-03: Sequence_Mask_Pickup NG inter-op retry — complete START→SET→END cycle repeats', () => {
        // Trace (other ops = full retry cycle per user description):
        //   spacerId=0: START, END, SET(NG). spacerId=1: START, END. Receipt barrel=0, spacer=1.
        // Expected: spacerRange=[0,1], 2 spacer ops, first NG, second OK.
        const lines = [
            L('Sequence_Mask_Pickup', 'START', { barrelTrayId: 'T1', spacerId: 0, startTs: 0 }),
            L('Sequence_Mask_Pickup', 'END',   { barrelTrayId: 'T1', spacerId: 0, endTs: 100, idealMs: 100 }),
            L('Sequence_Mask_Pickup', 'SET',   { barrelTrayId: 'T1', spacerId: 0, ngPath: 'C:\\ng\\spacer0.bmp', ngCode: 'No Spacer' }),
            L('Sequence_Mask_Pickup', 'START', { barrelTrayId: 'T1', spacerId: 1, startTs: 110 }),
            L('Sequence_Mask_Pickup', 'END',   { barrelTrayId: 'T1', spacerId: 1, endTs: 210, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 1 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'B-03');

        const barrel = result.trays[0].barrels[0];
        expect(barrel.spacerRange).toEqual([0, 1]);
        expect(barrel.receipt!.spacerId).toBe(1);

        const spacerOps = barrel.operations.filter(o => o.operationName === 'Sequence_Mask_Pickup');
        expect(spacerOps).toHaveLength(2);
        expect(spacerOps[0].isNg).toBe(true);
        expect(spacerOps[0].counterId).toBe(0);
        expect(spacerOps[0].ngCode).toBe('No Spacer');
        expect(spacerOps[1].isNg).toBe(false);
        expect(spacerOps[1].counterId).toBe(1);
    });

    it('B-04: Sequence_Lens_Pickup NG inter-op retry (different counter type from Lens_Tray_Align)', () => {
        // Trace: lensId=0: START, END, SET(NG). lensId=1: START, END. Receipt barrel=0, lens=1.
        // Expected: lensRange=[0,1], 2 pickup ops, first NG.
        const lines = [
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 100, idealMs: 100 }),
            L('Sequence_Lens_Pickup', 'SET',   { barrelTrayId: 'T1', lensId: 0, ngPath: 'C:\\ng\\lens0.bmp', ngCode: 'No Lens' }),
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 1, startTs: 110 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 1, endTs: 210, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 1, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'B-04');

        const barrel = result.trays[0].barrels[0];
        expect(barrel.lensRange).toEqual([0, 1]);

        const pickupOps = barrel.operations.filter(o => o.operationName === 'Sequence_Lens_Pickup');
        expect(pickupOps).toHaveLength(2);
        expect(pickupOps[0].isNg).toBe(true);
        expect(pickupOps[0].ngCode).toBe('No Lens');
        expect(pickupOps[1].isNg).toBe(false);
    });

    it('B-05: multiple different op types NG in the same barrel — NG marking is per-op not per-barrel', () => {
        // Trace: Lens_Pickup fails lensId=0 (retry at lensId=1 succeeds).
        //        Spacer_Pickup fails spacerId=0 (retry at spacerId=1 succeeds).
        //        Both retries for same barrel 0. Receipt: barrel=0, lens=1, spacer=1.
        // Expected: barrel isNg=false, but pickupOps[0].isNg=true AND spacerOps[0].isNg=true.
        const lines = [
            // Lens fails at 0, retries at 1
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 80, idealMs: 100 }),
            L('Sequence_Lens_Pickup', 'SET',   { barrelTrayId: 'T1', lensId: 0, ngPath: 'C:\\ng\\l0.bmp', ngCode: 'Lens Flipped' }),
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 1, startTs: 90 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 1, endTs: 170, idealMs: 100 }),
            // Spacer fails at 0, retries at 1
            L('Sequence_Mask_Pickup', 'START', { barrelTrayId: 'T1', spacerId: 0, startTs: 180 }),
            L('Sequence_Mask_Pickup', 'END',   { barrelTrayId: 'T1', spacerId: 0, endTs: 260, idealMs: 100 }),
            L('Sequence_Mask_Pickup', 'SET',   { barrelTrayId: 'T1', spacerId: 0, ngPath: 'C:\\ng\\s0.bmp', ngCode: 'Spacer Flipped' }),
            L('Sequence_Mask_Pickup', 'START', { barrelTrayId: 'T1', spacerId: 1, startTs: 270 }),
            L('Sequence_Mask_Pickup', 'END',   { barrelTrayId: 'T1', spacerId: 1, endTs: 350, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 1, spacerId: 1 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'B-05');

        const barrel = result.trays[0].barrels[0];
        expect(barrel.isNg).toBe(false); // barrel itself is OK
        expect(barrel.lensRange).toEqual([0, 1]);
        expect(barrel.spacerRange).toEqual([0, 1]);

        const lensOps = barrel.operations.filter(o => o.operationName === 'Sequence_Lens_Pickup');
        const spacerOps = barrel.operations.filter(o => o.operationName === 'Sequence_Mask_Pickup');
        expect(lensOps[0].isNg).toBe(true);
        expect(lensOps[0].ngCode).toBe('Lens Flipped');
        expect(spacerOps[0].isNg).toBe(true);
        expect(spacerOps[0].ngCode).toBe('Spacer Flipped');
    });

    it('B-06: NG SET appears AFTER END in log — still correctly attached (pre-indexing fix)', () => {
        // Trace: This is the exact timing edge case fixed in the parser.
        // The C++ logger may flush the NG SET after the END event.
        // Expected: op.isNg=true despite SET coming last.
        const lines = [
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 100, idealMs: 100 }),
            // SET comes AFTER END — the bug we fixed
            L('Sequence_Lens_Pickup', 'SET',   { barrelTrayId: 'T1', lensId: 0, ngPath: 'C:\\ng\\late.bmp', ngCode: 'Lens Marked' }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'B-06');

        const op = result.trays[0].barrels[0].operations[0];
        expect(op.isNg).toBe(true);
        expect(op.ngPath).toBe('C:\\ng\\late.bmp');
        expect(op.ngCode).toBe('Lens Marked');
    });
});

// ─── Group C: Barrel-level NG ────────────────────────────────────────────────
describe('Group C — Barrel-level NG', () => {

    it('C-01: Sequence_Barrel_Align_Lens NG — barrel 0 is NG, barrel 1 OK', () => {
        // Trace (from SeqBarrel.cpp kBarrelAlignLensSequence SetFailTime):
        //   Barrel 0: Align fails → SET(ngPath). No Barrel_Complete.
        //   Barrel 1: Align succeeds → Barrel_Complete.
        // Expected: 2 barrels. barrel 0 isNg=true, no receipt. barrel 1 isNg=false, receipt defined.
        const lines = [
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 0 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 0, endTs: 100, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'SET',   { barrelTrayId: 'T1', barrelId: 0, ngPath: 'C:\\ng\\barrel0.bmp', ngCode: 'Barrel Titled' }),
            // No Barrel_Complete for barrel 0
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 1, startTs: 110 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 1, endTs: 200, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T1', barrelId: 1, lensId: 0, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'C-01');

        expect(result.trays[0].barrels).toHaveLength(2);
        const b0 = result.trays[0].barrels[0];
        expect(b0.barrelId).toBe(0);
        expect(b0.isNg).toBe(true);
        expect(b0.receipt).toBeUndefined();
        expect(b0.ngOperationName).toContain('Barrel_Align_Lens');

        const b1 = result.trays[0].barrels[1];
        expect(b1.barrelId).toBe(1);
        expect(b1.isNg).toBe(false);
        expect(b1.receipt).toBeDefined();
    });

    it('C-02: Sequence_Barrel_Align_Mask NG — both barrel-level NG op names are handled', () => {
        // Trace: Same as C-01 but uses Barrel_Align_Mask (kBarrelAlignSpacerSequence in C++ code).
        // Expected: barrel 0 isNg=true, ngOperationName contains 'Barrel_Align_Mask'.
        const lines = [
            L('Sequence_Barrel_Align_Mask', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 0 }),
            L('Sequence_Barrel_Align_Mask', 'END',   { barrelTrayId: 'T1', barrelId: 0, endTs: 100, idealMs: 100 }),
            L('Sequence_Barrel_Align_Mask', 'SET',   { barrelTrayId: 'T1', barrelId: 0, ngPath: 'C:\\ng\\mask0.bmp', ngCode: 'Barrel Titled' }),
            L('Sequence_Barrel_Align_Mask', 'START', { barrelTrayId: 'T1', barrelId: 1, startTs: 110 }),
            L('Sequence_Barrel_Align_Mask', 'END',   { barrelTrayId: 'T1', barrelId: 1, endTs: 200, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T1', barrelId: 1, lensId: 0, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'C-02');

        const b0 = result.trays[0].barrels[0];
        expect(b0.isNg).toBe(true);
        expect(b0.ngOperationName).toContain('Barrel_Align_Mask');
        expect(b0.receipt).toBeUndefined();
    });

    it('C-03: barrel NG when spacer already picked before failure — spacer attributed to exactly one barrel', () => {
        // Trace: Spacer picked (spacerId=0) BEFORE barrel 0 align fails.
        //        Barrel 1 OK, receipt says spacerId=0 (the pre-picked spacer is reused).
        // Expected: spacerId=0 op appears in exactly one of the two barrels.
        const lines = [
            // Spacer picked for what becomes NG barrel 0
            L('Sequence_Mask_Pickup', 'START', { barrelTrayId: 'T1', spacerId: 0, startTs: 0 }),
            L('Sequence_Mask_Pickup', 'END',   { barrelTrayId: 'T1', spacerId: 0, endTs: 100, idealMs: 100 }),
            // Barrel 0 align fails
            L('Sequence_Barrel_Align_Mask', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 110 }),
            L('Sequence_Barrel_Align_Mask', 'END',   { barrelTrayId: 'T1', barrelId: 0, endTs: 200, idealMs: 100 }),
            L('Sequence_Barrel_Align_Mask', 'SET',   { barrelTrayId: 'T1', barrelId: 0, ngPath: 'C:\\ng\\b0.bmp', ngCode: 'Barrel Titled' }),
            // Barrel 1 OK, receipt reuses spacer=0
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 1, startTs: 210 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 1, endTs: 310, idealMs: 100 }),
            L('Sequence_Barrel_Align_Mask', 'START', { barrelTrayId: 'T1', barrelId: 1, startTs: 320 }),
            L('Sequence_Barrel_Align_Mask', 'END',   { barrelTrayId: 'T1', barrelId: 1, endTs: 400, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T1', barrelId: 1, lensId: 1, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'C-03');

        const [b0, b1] = result.trays[0].barrels;
        expect(b0.isNg).toBe(true);
        expect(b1.isNg).toBe(false);

        // spacerId=0 op appears exactly once across all barrels
        const allSpacerOps = [...b0.operations, ...b1.operations].filter(o => o.counterType === 'spacerId');
        expect(allSpacerOps).toHaveLength(1);
        expect(allSpacerOps[0].counterId).toBe(0);
    });

    it('C-04: NG is the FIRST barrel — range computation works when no previous OK barrel', () => {
        // Trace: barrel 0 NG, barrel 1 OK. Lens for barrel 0 = lensId=0.
        // Expected: barrel 0 lensRange=[0,0], barrel 1 gets lensId=1.
        const lines = [
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 80, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 90 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 0, endTs: 170, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'SET',   { barrelTrayId: 'T1', barrelId: 0, ngPath: 'C:\\ng\\b0.bmp', ngCode: 'No Barrel' }),
            // Barrel 1
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 1, startTs: 180 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 1, endTs: 260, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 1, startTs: 270 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 1, endTs: 350, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T1', barrelId: 1, lensId: 1, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'C-04');

        const [b0, b1] = result.trays[0].barrels;
        expect(b0.barrelId).toBe(0);
        expect(b0.isNg).toBe(true);
        expect(b0.lensRange).toEqual([0, 0]);
        expect(b1.barrelId).toBe(1);
        expect(b1.isNg).toBe(false);
        expect(b1.lensRange).toEqual([1, 1]);
    });

    it('C-05: NG is the LAST barrel — no next barrel exists (end-of-tray case)', () => {
        // Trace: barrel 0 OK. barrel 1 NG (no receipt follows). Tray ends.
        // Expected: 2 barrels. Last barrel isNg=true, no receipt.
        const lines = [
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 80, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
            // Last barrel — fails
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 1, startTs: 90 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 1, endTs: 170, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 1, startTs: 180 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 1, endTs: 260, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'SET',   { barrelTrayId: 'T1', barrelId: 1, ngPath: 'C:\\ng\\last.bmp', ngCode: 'Barrel Titled' }),
            // No more Barrel_Complete — tray ends
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'C-05');

        expect(result.trays[0].barrels).toHaveLength(2);
        const lastBarrel = result.trays[0].barrels[1];
        expect(lastBarrel.barrelId).toBe(1);
        expect(lastBarrel.isNg).toBe(true);
        expect(lastBarrel.receipt).toBeUndefined();
    });

    it('C-06: OK → NG → OK sequence — ranges non-overlapping across mixed barrel types', () => {
        // Trace: barrel 0 OK (lens=0), barrel 1 NG (lens=1), barrel 2 OK (lens=2).
        // Expected: 3 barrels, ranges [0,0], [1,1], [2,2]. Middle barrel NG.
        const lines = [
            // Barrel 0 OK
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 80, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
            // Barrel 1 NG
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 1, startTs: 90 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 1, endTs: 170, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 1, startTs: 180 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 1, endTs: 260, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'SET',   { barrelTrayId: 'T1', barrelId: 1, ngPath: 'C:\\ng\\b1.bmp', ngCode: 'Barrel Titled' }),
            // Barrel 2 OK
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 2, startTs: 270 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 2, endTs: 350, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 2, lensId: 2, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'C-06');

        const { barrels } = result.trays[0];
        expect(barrels).toHaveLength(3);
        expect(barrels[0].isNg).toBe(false);
        expect(barrels[0].lensRange).toEqual([0, 0]);
        expect(barrels[1].isNg).toBe(true);
        expect(barrels[1].lensRange).toEqual([1, 1]);
        expect(barrels[2].isNg).toBe(false);
        expect(barrels[2].lensRange).toEqual([2, 2]);

        // Lens pick for lensId=1 attributed to NG barrel 1
        const b1LensOp = barrels[1].operations.find(o => o.operationName === 'Sequence_Lens_Pickup');
        expect(b1LensOp?.counterId).toBe(1);
        // Lens pick for lensId=2 attributed to OK barrel 2
        const b2LensOp = barrels[2].operations.find(o => o.operationName === 'Sequence_Lens_Pickup');
        expect(b2LensOp?.counterId).toBe(2);
    });

    it('C-07: NG → NG → OK sequence — two consecutive NG barrels, invariants hold', () => {
        // Trace: barrel 0 NG (lens=0), barrel 1 NG (lens=1), barrel 2 OK (lens=2).
        // Expected: 3 barrels, barrels 0+1 isNg=true, barrel 2 isNg=false, no overlapping ranges.
        const lines = [
            // Barrel 0 NG
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 80, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 90 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 0, endTs: 170, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'SET',   { barrelTrayId: 'T1', barrelId: 0, ngPath: 'C:\\ng\\b0.bmp', ngCode: 'No Barrel' }),
            // Barrel 1 NG
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 1, startTs: 180 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 1, endTs: 260, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 1, startTs: 270 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 1, endTs: 350, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'SET',   { barrelTrayId: 'T1', barrelId: 1, ngPath: 'C:\\ng\\b1.bmp', ngCode: 'Barrel Titled' }),
            // Barrel 2 OK
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 2, startTs: 360 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 2, endTs: 440, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 2, lensId: 2, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'C-07');

        const { barrels } = result.trays[0];
        expect(barrels).toHaveLength(3);
        expect(barrels[0].isNg).toBe(true);
        expect(barrels[1].isNg).toBe(true);
        expect(barrels[2].isNg).toBe(false);
        expect(barrels[2].receipt).toBeDefined();
        // All lensRanges must be non-overlapping (covered by I-3 via assertInvariants)
    });
});

// ─── Group D: Multi-tray Combinations ───────────────────────────────────────
describe('Group D — Multi-tray combinations', () => {

    it('D-01: T1 complete + T2 incomplete in same file', () => {
        // Trace: T1 has Barrel_Complete. T2 has ops but no Barrel_Complete (log cut).
        // Expected: result.trays has 2 trays. T1 complete, T2 isIncomplete=true.
        // For T2 (incomplete): parser puts all ops into trayOperations since there are
        // no receipts and no barrel NGs. These ops may be lensId-typed since that is
        // what the ops are — the trayOperations fallback is for unstructured incomplete data.
        const lines = [
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 100, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),

            // T2 uses lensTrayId ops only (proper tray-level ops) so I-7 holds
            L('Sequence_Load_Tray/Pallet_In', 'START', { barrelTrayId: 'T2', lensTrayId: 0, startTs: 200 }),
            L('Sequence_Load_Tray/Pallet_In', 'END',   { barrelTrayId: 'T2', lensTrayId: 0, endTs: 300, idealMs: 100 }),
            // T2 log ends here — no Barrel_Complete
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'D-01');

        expect(result.trays).toHaveLength(2);
        const t1 = result.trays.find(t => t.barrelTrayId === 'T1')!;
        const t2 = result.trays.find(t => t.barrelTrayId === 'T2')!;
        expect(t1).toBeDefined();
        expect(t2).toBeDefined();
        expect(t1.isIncomplete).toBe(false);
        expect(t1.barrels).toHaveLength(1);
        expect(t2.isIncomplete).toBe(true);
        expect(t2.barrels).toHaveLength(0);
        // T2 incomplete tray gets ops in trayOperations
        expect(t2.trayOperations).toHaveLength(1);
        expect(t2.trayOperations[0].counterType).toBe('lensTrayId');
    });

    it('D-02: T1 has barrel NG, T2 all OK — NG scoped to correct tray only', () => {
        // Trace: T1 barrel 0 NG (Barrel_Align_Lens), barrel 1 OK.
        //        T2 barrel 0 OK.
        // Expected: T1 has [NG, OK]. T2 has [OK]. T2 unaffected by T1's NG.
        const lines = [
            // T1 barrel 0 NG
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 0 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 0, endTs: 100, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'SET',   { barrelTrayId: 'T1', barrelId: 0, ngPath: 'C:\\ng\\t1b0.bmp', ngCode: 'No Barrel' }),
            // T1 barrel 1 OK
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 1, startTs: 110 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 1, endTs: 200, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T1', barrelId: 1, lensId: 0, spacerId: 0 }),
            // T2 barrel 0 OK
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T2', barrelId: 0, startTs: 300 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T2', barrelId: 0, endTs: 400, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T2', barrelId: 0, lensId: 0, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'D-02');

        const t1 = result.trays.find(t => t.barrelTrayId === 'T1')!;
        const t2 = result.trays.find(t => t.barrelTrayId === 'T2')!;

        expect(t1.barrels).toHaveLength(2);
        expect(t1.barrels[0].isNg).toBe(true);
        expect(t1.barrels[1].isNg).toBe(false);

        expect(t2.barrels).toHaveLength(1);
        expect(t2.barrels[0].isNg).toBe(false);
        // T2 should have 0 NG barrels
        expect(t2.barrels.filter(b => b.isNg)).toHaveLength(0);
    });

    it('D-03: interleaved T1+T2 log lines — both trays parsed correctly despite mixing', () => {
        // Trace: T1 and T2 events interleaved (as can happen in real logs during pipelining).
        // T2 uses globally-continuing lensId=2 (real machine never resets per tray).
        // Parser groups by barrelTrayId, so interleaving must not corrupt either tray.
        const lines = [
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T2', lensId: 2, startTs: 5 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 100, idealMs: 100 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T2', lensId: 2, endTs: 105, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T2', barrelId: 0, lensId: 2, spacerId: 1 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'D-03');

        expect(result.trays).toHaveLength(2);
        const t1 = result.trays.find(t => t.barrelTrayId === 'T1')!;
        const t2 = result.trays.find(t => t.barrelTrayId === 'T2')!;
        // Both should have exactly 1 barrel with 1 op each
        expect(t1.barrels).toHaveLength(1);
        expect(t2.barrels).toHaveLength(1);
        expect(t1.barrels[0].operations).toHaveLength(1);
        expect(t2.barrels[0].operations).toHaveLength(1);
        // Ops not cross-contaminated — each carries its tray's barrelTrayId
        expect(t1.barrels[0].operations[0].counterId).toBe(0);
        expect(t2.barrels[0].operations[0].counterId).toBe(2);
        t1.barrels[0].operations.forEach(op => expect(op.barrelTrayId).toBe('T1'));
        t2.barrels[0].operations.forEach(op => expect(op.barrelTrayId).toBe('T2'));
    });
});

// ─── Group E: Robustness / Partial Data ─────────────────────────────────────
describe('Group E — Robustness / Partial Data', () => {

    it('E-01: empty content — returns zero trays with zero summary counts', () => {
        const result = parseLogContent('');
        assertInvariants(result, 'E-01');
        expect(result.trays).toHaveLength(0);
        expect(result.summary.totalBarrels).toBe(0);
        expect(result.summary.totalTrays).toBe(0);
    });

    it('E-02: lines with wrong column count are silently skipped, valid lines still parse', () => {
        // Trace: 2 malformed lines (too few tabs), then valid lens pickup + barrel complete.
        // Expected: 1 tray, 1 barrel, 1 op — malformed lines ignored.
        const lines = [
            'this line has no tabs and should be skipped',
            '2026-05-20\tLensAssembler\tonlyThreeColumns',
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 100, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'E-02');

        expect(result.trays).toHaveLength(1);
        expect(result.trays[0].barrels).toHaveLength(1);
        expect(result.trays[0].barrels[0].operations).toHaveLength(1);
    });

    it('E-03: malformed JSON on col 10 — line skipped, rest of tray still parses correctly', () => {
        // Trace: valid START line, then a line where JSON is malformed, then valid END + receipt.
        // Expected: op still parsed (START + END pair complete), bad line silent skipped.
        const lines = [
            L('Sequence_Lens_Pickup', 'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            // Malformed JSON line — should be skipped gracefully
            '2026-05-20 17:49:41.000\tLensAssembler3.0\tA\t-\t-\tProductID\tIDLE\tSeq_Log_Analyzer\tSequence_Lens_Pickup\tSET\t{BAD JSON!!!}',
            L('Sequence_Lens_Pickup', 'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 100, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'E-03');

        expect(result.trays).toHaveLength(1);
        expect(result.trays[0].barrels).toHaveLength(1);
        const op = result.trays[0].barrels[0].operations[0];
        // The op is parsed from START+END, the bad SET line was skipped
        expect(op.operationName).toBe('Sequence_Lens_Pickup');
        // isNg should be false because the malformed SET was skipped (not treated as NG)
        expect(op.isNg).toBe(false);
    });
});

// ─── Group F: Summary / Meta Correctness ────────────────────────────────────
describe('Group F — Summary / Meta correctness', () => {

    it('F-01: allOperationNames is sorted alphabetically', () => {
        // Trace: 3 different operation names mixed in log order.
        // Expected: allOperationNames contains all 3, sorted A→Z.
        const lines = [
            L('Sequence_Mask_Pickup', 'START', { barrelTrayId: 'T1', spacerId: 0, startTs: 0 }),
            L('Sequence_Mask_Pickup', 'END',   { barrelTrayId: 'T1', spacerId: 0, endTs: 50, idealMs: 100 }),
            L('Sequence_Lens_Pickup',   'START', { barrelTrayId: 'T1', lensId: 0, startTs: 60 }),
            L('Sequence_Lens_Pickup',   'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 110, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 120 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 0, endTs: 180, idealMs: 100 }),
            L('Sequence_Barrel_Complete', 'SET', { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'F-01');

        expect(result.allOperationNames).toContain('Sequence_Barrel_Align_Lens');
        expect(result.allOperationNames).toContain('Sequence_Lens_Pickup');
        expect(result.allOperationNames).toContain('Sequence_Mask_Pickup');
        // Check sorted order
        const sortedCopy = [...result.allOperationNames].sort();
        expect(result.allOperationNames).toEqual(sortedCopy);
    });

    it('F-02: barrelAlignStartTs is set to startTs of the earliest barrel-direct operation', () => {
        // Trace: lens pick (startTs=0) then barrel align (startTs=200).
        // barrelAlignStartTs should be 200 (first op with barrelId counter).
        const lines = [
            L('Sequence_Lens_Pickup',       'START', { barrelTrayId: 'T1', lensId: 0, startTs: 0 }),
            L('Sequence_Lens_Pickup',       'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 100, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 200 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 0, endTs: 300, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'F-02');

        expect(result.trays[0].barrels[0].barrelAlignStartTs).toBe(200);
    });

    it('F-03: summary.totalBarrels counts BOTH OK and NG barrels', () => {
        // Trace: 1 NG barrel + 1 OK barrel = 2 total barrels.
        // Expected: summary.totalBarrels = 2 (not 1).
        const lines = [
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 0 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 0, endTs: 100, idealMs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'SET',   { barrelTrayId: 'T1', barrelId: 0, ngPath: 'C:\\ng\\b0.bmp', ngCode: 'Barrel Titled' }),
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 1, startTs: 110 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 1, endTs: 200, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T1', barrelId: 1, lensId: 0, spacerId: 0 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'F-03');

        expect(result.summary.totalBarrels).toBe(2);
        expect(result.summary.totalTrays).toBe(1);
    });

    it('F-04: tray-level operations (lensTrayId) appear in trayOperations with correct hierarchy', () => {
        // Trace: Two sub-operations with /-delimited names (from SeqTray.cpp).
        // Expected: 2 trayOperations, 0 barrels, hierarchy arrays correct.
        const lines = [
            L('Sequence_Load_Tray/Pallet_In',    'START', { barrelTrayId: 'T1', lensTrayId: 0, startTs: 0 }),
            L('Sequence_Load_Tray/Pallet_In',    'END',   { barrelTrayId: 'T1', lensTrayId: 0, endTs: 500, idealMs: 400 }),
            L('Sequence_Load_Tray/Magazine_Run', 'START', { barrelTrayId: 'T1', lensTrayId: 0, startTs: 510 }),
            L('Sequence_Load_Tray/Magazine_Run', 'END',   { barrelTrayId: 'T1', lensTrayId: 0, endTs: 800, idealMs: 200 }),
        ];
        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'F-04');

        const tray = result.trays[0];
        expect(tray.barrels).toHaveLength(0);
        expect(tray.trayOperations).toHaveLength(2);
        expect(tray.trayOperations[0].hierarchy).toEqual(['Sequence_Load_Tray', 'Pallet_In']);
        expect(tray.trayOperations[1].hierarchy).toEqual(['Sequence_Load_Tray', 'Magazine_Run']);
    });
});

// ─── Cross-Tray Pipelining Tests ─────────────────────────────────────────────
/**
 * The machine pipelines work across tray boundaries.
 * While assembling barrel N of tray T, it runs look-ahead ops (Lens_Pickup, Lens_Align,
 * Mask_Pickup, Mask_Align) for barrel 0 of the NEXT tray T+1, logging those under tray T's
 * barrelTrayId. After tray T's barrel ranges are computed, these ops exceed the last barrel's
 * range and were previously silently dropped. Now they carry forward into tray T+1's barrel 0.
 *
 * Root cause: discovered from 2026052015_GeneralLog.log (174941 → 175009).
 */
describe('Cross-Tray Pipelining', () => {

    it('P-01: Look-ahead Lens/Mask ops logged under tray T appear in tray T+1 barrel 0', () => {
        const lines = [
            // Tray T1 barrel 0 (lensId=0, spacerId=0)
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 0, endTs: 200, idealMs: 100 }),
            L('Sequence_Lens_Pickup',       'START', { barrelTrayId: 'T1', lensId: 0, startTs: 210 }),
            L('Sequence_Lens_Pickup',       'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 300, idealMs: 100 }),
            L('Sequence_Lens_Align',        'START', { barrelTrayId: 'T1', lensId: 0, startTs: 310 }),
            L('Sequence_Lens_Align',        'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 400, idealMs: 100 }),
            L('Sequence_Barrel_Align_Mask', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 410 }),
            L('Sequence_Barrel_Align_Mask', 'END',   { barrelTrayId: 'T1', barrelId: 0, endTs: 500, idealMs: 100 }),
            L('Sequence_Mask_Pickup',       'START', { barrelTrayId: 'T1', spacerId: 0, startTs: 510 }),
            L('Sequence_Mask_Pickup',       'END',   { barrelTrayId: 'T1', spacerId: 0, endTs: 600, idealMs: 100 }),
            L('Sequence_Mask_Align',        'START', { barrelTrayId: 'T1', spacerId: 0, startTs: 610 }),
            L('Sequence_Mask_Align',        'END',   { barrelTrayId: 'T1', spacerId: 0, endTs: 700, idealMs: 100 }),
            L('Sequence_Mask_Insert',       'START', { barrelTrayId: 'T1', spacerId: 0, startTs: 710 }),
            L('Sequence_Mask_Insert',       'END',   { barrelTrayId: 'T1', spacerId: 0, endTs: 800, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
            // Look-ahead for T2 barrel 0, still logged under T1!
            L('Sequence_Lens_Pickup',       'START', { barrelTrayId: 'T1', lensId: 2, startTs: 820 }),
            L('Sequence_Lens_Pickup',       'END',   { barrelTrayId: 'T1', lensId: 2, endTs: 910, idealMs: 100 }),
            L('Sequence_Lens_Align',        'START', { barrelTrayId: 'T1', lensId: 2, startTs: 920 }),
            L('Sequence_Lens_Align',        'END',   { barrelTrayId: 'T1', lensId: 2, endTs: 1010, idealMs: 100 }),
            L('Sequence_Mask_Pickup',       'START', { barrelTrayId: 'T1', spacerId: 1, startTs: 1020 }),
            L('Sequence_Mask_Pickup',       'END',   { barrelTrayId: 'T1', spacerId: 1, endTs: 1100, idealMs: 100 }),
            L('Sequence_Mask_Align',        'START', { barrelTrayId: 'T1', spacerId: 1, startTs: 1110 }),
            L('Sequence_Mask_Align',        'END',   { barrelTrayId: 'T1', spacerId: 1, endTs: 1200, idealMs: 100 }),
            // Tray T2 barrel 0 (lensId=2, spacerId=1) — only has insert/barrel ops
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T2', barrelId: 0, startTs: 1300 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T2', barrelId: 0, endTs: 1400, idealMs: 100 }),
            L('Sequence_Lens_Insert',       'START', { barrelTrayId: 'T2', lensId: 2, startTs: 1410 }),
            L('Sequence_Lens_Insert',       'END',   { barrelTrayId: 'T2', lensId: 2, endTs: 1500, idealMs: 100 }),
            L('Sequence_Barrel_Align_Mask', 'START', { barrelTrayId: 'T2', barrelId: 0, startTs: 1510 }),
            L('Sequence_Barrel_Align_Mask', 'END',   { barrelTrayId: 'T2', barrelId: 0, endTs: 1600, idealMs: 100 }),
            L('Sequence_Mask_Insert',       'START', { barrelTrayId: 'T2', spacerId: 1, startTs: 1610 }),
            L('Sequence_Mask_Insert',       'END',   { barrelTrayId: 'T2', spacerId: 1, endTs: 1700, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T2', barrelId: 0, lensId: 2, spacerId: 1 }),
        ];

        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'P-01');
        expect(result.trays).toHaveLength(2);

        const t1 = result.trays.find(t => t.barrelTrayId === 'T1')!;
        const t2 = result.trays.find(t => t.barrelTrayId === 'T2')!;

        // T1 barrel 0: must have lensId=0 ops, must NOT contain the look-ahead lensId=2 ops
        expect(t1.barrels[0].operations.some(o => o.operationName === 'Sequence_Lens_Pickup' && o.counterId === 0)).toBe(true);
        expect(t1.barrels[0].operations.some(o => o.counterId === 2)).toBe(false);

        // T2 barrel 0: must contain all 4 carried-over look-ahead ops
        const t2b0 = t2.barrels[0].operations;
        expect(t2b0.some(o => o.operationName === 'Sequence_Lens_Pickup' && o.counterId === 2),
            'T2 b0: carried Lens_Pickup lensId=2').toBe(true);
        expect(t2b0.some(o => o.operationName === 'Sequence_Lens_Align'  && o.counterId === 2),
            'T2 b0: carried Lens_Align lensId=2').toBe(true);
        expect(t2b0.some(o => o.operationName === 'Sequence_Mask_Pickup' && o.counterId === 1),
            'T2 b0: carried Mask_Pickup spacerId=1').toBe(true);
        expect(t2b0.some(o => o.operationName === 'Sequence_Mask_Align'  && o.counterId === 1),
            'T2 b0: carried Mask_Align spacerId=1').toBe(true);
    });

    it('P-02: lensStart for first barrel of non-first tray uses prevTrayLastReceipt, not 0', () => {
        const lines = [
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 0, endTs: 200, idealMs: 100 }),
            L('Sequence_Lens_Pickup',       'START', { barrelTrayId: 'T1', lensId: 0, startTs: 210 }),
            L('Sequence_Lens_Pickup',       'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 300, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),

            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T2', barrelId: 0, startTs: 400 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T2', barrelId: 0, endTs: 500, idealMs: 100 }),
            L('Sequence_Lens_Insert',       'START', { barrelTrayId: 'T2', lensId: 2, startTs: 510 }),
            L('Sequence_Lens_Insert',       'END',   { barrelTrayId: 'T2', lensId: 2, endTs: 600, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T2', barrelId: 0, lensId: 2, spacerId: 1 }),
        ];

        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'P-02');

        const t2b0 = result.trays.find(t => t.barrelTrayId === 'T2')!.barrels[0];
        // lensStart = T1 lastReceipt.lensId + 1 = 0+1 = 1; lensEnd = 2 → [1,2]
        expect(t2b0.lensRange[0], 'lensStart must be 1, not 0').toBe(1);
        expect(t2b0.lensRange[1]).toBe(2);
        // spacerStart = T1 lastReceipt.spacerId + 1 = 0+1 = 1; spacerEnd = 1 → [1,1]
        expect(t2b0.spacerRange[0], 'spacerStart must be 1, not 0').toBe(1);
        expect(t2b0.spacerRange[1]).toBe(1);
    });

    it('P-03: Three consecutive trays — carry-over chains through T1→T2→T3', () => {
        const lines = [
            // T1 barrel 0 (lensId=0)
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 0, endTs: 200, idealMs: 100 }),
            L('Sequence_Lens_Insert',       'START', { barrelTrayId: 'T1', lensId: 0, startTs: 210 }),
            L('Sequence_Lens_Insert',       'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 300, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
            L('Sequence_Lens_Pickup',       'START', { barrelTrayId: 'T1', lensId: 2, startTs: 310 }),
            L('Sequence_Lens_Pickup',       'END',   { barrelTrayId: 'T1', lensId: 2, endTs: 400, idealMs: 100 }),

            // T2 barrel 0 (lensId=2)
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T2', barrelId: 0, startTs: 500 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T2', barrelId: 0, endTs: 600, idealMs: 100 }),
            L('Sequence_Lens_Insert',       'START', { barrelTrayId: 'T2', lensId: 2, startTs: 610 }),
            L('Sequence_Lens_Insert',       'END',   { barrelTrayId: 'T2', lensId: 2, endTs: 700, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T2', barrelId: 0, lensId: 2, spacerId: 1 }),
            L('Sequence_Lens_Pickup',       'START', { barrelTrayId: 'T2', lensId: 4, startTs: 710 }),
            L('Sequence_Lens_Pickup',       'END',   { barrelTrayId: 'T2', lensId: 4, endTs: 800, idealMs: 100 }),

            // T3 barrel 0 (lensId=4)
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T3', barrelId: 0, startTs: 900 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T3', barrelId: 0, endTs: 1000, idealMs: 100 }),
            L('Sequence_Lens_Insert',       'START', { barrelTrayId: 'T3', lensId: 4, startTs: 1010 }),
            L('Sequence_Lens_Insert',       'END',   { barrelTrayId: 'T3', lensId: 4, endTs: 1100, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T3', barrelId: 0, lensId: 4, spacerId: 2 }),
        ];

        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'P-03');
        expect(result.trays).toHaveLength(3);

        const t2 = result.trays.find(t => t.barrelTrayId === 'T2')!;
        const t3 = result.trays.find(t => t.barrelTrayId === 'T3')!;

        expect(t2.barrels[0].operations.some(o => o.operationName === 'Sequence_Lens_Pickup' && o.counterId === 2),
            'T2 b0: carry from T1').toBe(true);
        expect(t3.barrels[0].operations.some(o => o.operationName === 'Sequence_Lens_Pickup' && o.counterId === 4),
            'T3 b0: carry from T2').toBe(true);

        expect(t2.barrels[0].lensRange[0]).toBe(1); // T1 lensId=0 → start=1
        expect(t3.barrels[0].lensRange[0]).toBe(3); // T2 lensId=2 → start=3
    });

    it('P-04: Carried-over op barrelTrayId is re-stamped to the receiving tray', () => {
        const lines = [
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 0, endTs: 200, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),
            L('Sequence_Lens_Pickup',       'START', { barrelTrayId: 'T1', lensId: 2, startTs: 210 }),
            L('Sequence_Lens_Pickup',       'END',   { barrelTrayId: 'T1', lensId: 2, endTs: 300, idealMs: 100 }),

            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T2', barrelId: 0, startTs: 400 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T2', barrelId: 0, endTs: 500, idealMs: 100 }),
            L('Sequence_Lens_Insert',       'START', { barrelTrayId: 'T2', lensId: 2, startTs: 510 }),
            L('Sequence_Lens_Insert',       'END',   { barrelTrayId: 'T2', lensId: 2, endTs: 600, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T2', barrelId: 0, lensId: 2, spacerId: 1 }),
        ];

        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'P-04');

        const t2 = result.trays.find(t => t.barrelTrayId === 'T2')!;
        const carriedOp = t2.barrels[0].operations.find(
            o => o.operationName === 'Sequence_Lens_Pickup' && o.counterId === 2
        );
        expect(carriedOp, 'carried op must be in T2 barrel 0').toBeDefined();
        expect(carriedOp!.barrelTrayId, 'barrelTrayId must be re-stamped to T2').toBe('T2');
    });

    it('P-05: No carry-over when all ops fit within the last barrel range (clean tray end)', () => {
        const lines = [
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T1', barrelId: 0, startTs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T1', barrelId: 0, endTs: 200, idealMs: 100 }),
            L('Sequence_Lens_Pickup',       'START', { barrelTrayId: 'T1', lensId: 0, startTs: 210 }),
            L('Sequence_Lens_Pickup',       'END',   { barrelTrayId: 'T1', lensId: 0, endTs: 300, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T1', barrelId: 0, lensId: 0, spacerId: 0 }),

            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: 'T2', barrelId: 0, startTs: 400 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: 'T2', barrelId: 0, endTs: 500, idealMs: 100 }),
            L('Sequence_Lens_Insert',       'START', { barrelTrayId: 'T2', lensId: 2, startTs: 510 }),
            L('Sequence_Lens_Insert',       'END',   { barrelTrayId: 'T2', lensId: 2, endTs: 600, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: 'T2', barrelId: 0, lensId: 2, spacerId: 1 }),
        ];

        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'P-05');

        const t2 = result.trays.find(t => t.barrelTrayId === 'T2')!;
        // Exactly 2 ops in T2 b0: Barrel_Align_Lens + Lens_Insert — no extras carried from T1
        expect(t2.barrels[0].operations).toHaveLength(2);
        expect(t2.barrels[0].operations.some(o => o.operationName === 'Sequence_Lens_Pickup')).toBe(false);
    });

    it('P-06: Production-replica — 174941 look-ahead ops appear in 175009 barrel 0', () => {
        const lines = [
            // 174941 barrel 0
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: '20260520_174941', barrelId: 0, startTs: 100 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: '20260520_174941', barrelId: 0, endTs: 200, idealMs: 100 }),
            L('Sequence_Lens_Pickup',       'START', { barrelTrayId: '20260520_174941', lensId: 0, startTs: 210 }),
            L('Sequence_Lens_Pickup',       'END',   { barrelTrayId: '20260520_174941', lensId: 0, endTs: 300, idealMs: 100 }),
            L('Sequence_Lens_Align',        'START', { barrelTrayId: '20260520_174941', lensId: 0, startTs: 310 }),
            L('Sequence_Lens_Align',        'END',   { barrelTrayId: '20260520_174941', lensId: 0, endTs: 400, idealMs: 100 }),
            L('Sequence_Barrel_Align_Mask', 'START', { barrelTrayId: '20260520_174941', barrelId: 0, startTs: 410 }),
            L('Sequence_Barrel_Align_Mask', 'END',   { barrelTrayId: '20260520_174941', barrelId: 0, endTs: 500, idealMs: 100 }),
            L('Sequence_Mask_Pickup',       'START', { barrelTrayId: '20260520_174941', spacerId: 0, startTs: 510 }),
            L('Sequence_Mask_Pickup',       'END',   { barrelTrayId: '20260520_174941', spacerId: 0, endTs: 600, idealMs: 100 }),
            L('Sequence_Mask_Align',        'START', { barrelTrayId: '20260520_174941', spacerId: 0, startTs: 610 }),
            L('Sequence_Mask_Align',        'END',   { barrelTrayId: '20260520_174941', spacerId: 0, endTs: 700, idealMs: 100 }),
            L('Sequence_Mask_Insert',       'START', { barrelTrayId: '20260520_174941', spacerId: 0, startTs: 710 }),
            L('Sequence_Mask_Insert',       'END',   { barrelTrayId: '20260520_174941', spacerId: 0, endTs: 800, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: '20260520_174941', barrelId: 0, lensId: 0, spacerId: 0 }),
            // Look-ahead for 175009 barrel 0, logged under 174941
            L('Sequence_Lens_Pickup',       'START', { barrelTrayId: '20260520_174941', lensId: 8, startTs: 820 }),
            L('Sequence_Lens_Pickup',       'END',   { barrelTrayId: '20260520_174941', lensId: 8, endTs: 900, idealMs: 100 }),
            L('Sequence_Lens_Align',        'START', { barrelTrayId: '20260520_174941', lensId: 8, startTs: 910 }),
            L('Sequence_Lens_Align',        'END',   { barrelTrayId: '20260520_174941', lensId: 8, endTs: 1000, idealMs: 100 }),
            L('Sequence_Mask_Pickup',       'START', { barrelTrayId: '20260520_174941', spacerId: 4, startTs: 1010 }),
            L('Sequence_Mask_Pickup',       'END',   { barrelTrayId: '20260520_174941', spacerId: 4, endTs: 1100, idealMs: 100 }),
            L('Sequence_Mask_Align',        'START', { barrelTrayId: '20260520_174941', spacerId: 4, startTs: 1110 }),
            L('Sequence_Mask_Align',        'END',   { barrelTrayId: '20260520_174941', spacerId: 4, endTs: 1200, idealMs: 100 }),
            // 175009 barrel 0
            L('Sequence_Barrel_Align_Lens', 'START', { barrelTrayId: '20260520_175009', barrelId: 0, startTs: 1300 }),
            L('Sequence_Barrel_Align_Lens', 'END',   { barrelTrayId: '20260520_175009', barrelId: 0, endTs: 1400, idealMs: 100 }),
            L('Sequence_Lens_Insert',       'START', { barrelTrayId: '20260520_175009', lensId: 8, startTs: 1410 }),
            L('Sequence_Lens_Insert',       'END',   { barrelTrayId: '20260520_175009', lensId: 8, endTs: 1500, idealMs: 100 }),
            L('Sequence_Barrel_Align_Mask', 'START', { barrelTrayId: '20260520_175009', barrelId: 0, startTs: 1510 }),
            L('Sequence_Barrel_Align_Mask', 'END',   { barrelTrayId: '20260520_175009', barrelId: 0, endTs: 1600, idealMs: 100 }),
            L('Sequence_Mask_Insert',       'START', { barrelTrayId: '20260520_175009', spacerId: 4, startTs: 1610 }),
            L('Sequence_Mask_Insert',       'END',   { barrelTrayId: '20260520_175009', spacerId: 4, endTs: 1700, idealMs: 100 }),
            L('Sequence_Barrel_Complete',   'SET',   { barrelTrayId: '20260520_175009', barrelId: 0, lensId: 8, spacerId: 4 }),
        ];

        const result = parseLogContent(lines.join('\n'));
        assertInvariants(result, 'P-06');
        expect(result.trays).toHaveLength(2);

        const t2 = result.trays.find(t => t.barrelTrayId === '20260520_175009')!;
        const t2b0 = t2.barrels[0].operations;

        // Own ops (logged under 175009)
        expect(t2b0.some(o => o.operationName === 'Sequence_Barrel_Align_Lens')).toBe(true);
        expect(t2b0.some(o => o.operationName === 'Sequence_Barrel_Align_Mask')).toBe(true);
        expect(t2b0.some(o => o.operationName === 'Sequence_Lens_Insert'  && o.counterId === 8)).toBe(true);
        expect(t2b0.some(o => o.operationName === 'Sequence_Mask_Insert'  && o.counterId === 4)).toBe(true);
        // Carried over from 174941:
        expect(t2b0.some(o => o.operationName === 'Sequence_Lens_Pickup'  && o.counterId === 8),
            'carried Lens_Pickup(8)').toBe(true);
        expect(t2b0.some(o => o.operationName === 'Sequence_Lens_Align'   && o.counterId === 8),
            'carried Lens_Align(8)').toBe(true);
        expect(t2b0.some(o => o.operationName === 'Sequence_Mask_Pickup'  && o.counterId === 4),
            'carried Mask_Pickup(4)').toBe(true);
        expect(t2b0.some(o => o.operationName === 'Sequence_Mask_Align'   && o.counterId === 4),
            'carried Mask_Align(4)').toBe(true);

        // lensRange: start = 174941 last lensId+1 = 1, end = 8 → [1, 8]
        expect(t2.barrels[0].lensRange[0]).toBe(1);
        expect(t2.barrels[0].lensRange[1]).toBe(8);
        // spacerRange: start = 174941 last spacerId+1 = 1, end = 4 → [1, 4]
        expect(t2.barrels[0].spacerRange[0]).toBe(1);
        expect(t2.barrels[0].spacerRange[1]).toBe(4);
    });
});
