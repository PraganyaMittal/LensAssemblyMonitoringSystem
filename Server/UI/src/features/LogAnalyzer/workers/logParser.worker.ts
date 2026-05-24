
/**
 * Log Parser Web Worker — Two-Pass Generic Algorithm
 *
 * Pass 1: Parse all log lines → group by barrelTrayId → collect Barrel_Complete receipts
 * Pass 2: Compute ownership ranges → match START/END pairs → assign operations to barrels
 *
 * This parser is SCHEMA-AGNOSTIC: it detects operation types by the presence of
 * lensId/spacerId/barrelId keys rather than hardcoded operation names.
 */

import type {
    AnalysisResult,
    OperationData,
    Barrel,
    BarrelTray,
    BarrelReceipt,
    CounterType,
} from '../types/log.schemas';

// ─── Types for internal parsing state ──────────────────────────────────────

interface RawEvent {
    operationName: string;
    eventType: 'START' | 'END' | 'SET';
    barrelTrayId: string;
    counterType: CounterType;
    counterId: number;
    startTs?: number;
    endTs?: number;
    idealMs?: number;
    ngPath?: string;
    ngCode?: string;
    /** For Barrel_Complete SET events */
    receiptLensId?: number;
    receiptSpacerId?: number;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Detect counter type from JSON keys */
function detectCounterType(data: Record<string, unknown>): { type: CounterType; id: number } | null {
    if (typeof data.lensId === 'number') return { type: 'lensId', id: data.lensId };
    if (typeof data.spacerId === 'number') return { type: 'spacerId', id: data.spacerId };
    if (typeof data.barrelId === 'number') return { type: 'barrelId', id: data.barrelId };
    if (typeof data.lensTrayId === 'number') return { type: 'lensTrayId', id: data.lensTrayId };
    return null;
}

/** Check if a SET event is a Barrel_Complete receipt */
function isBarrelComplete(operationName: string): boolean {
    return operationName === 'Sequence_Barrel_Complete';
}

/** Check if a SET event is an NG event (has ngPath) */
function isNgEvent(data: Record<string, unknown>): boolean {
    return typeof data.ngPath === 'string' && data.ngPath.length > 0;
}

/** Build hierarchy from /-delimited operation name */
function buildHierarchy(operationName: string): string[] {
    return operationName.split('/');
}

/** Check if an operation is tray-level (has lensTrayId, no barrel assignment) */
function isTrayLevelOp(counterType: CounterType): boolean {
    return counterType === 'lensTrayId';
}

// ─── PASS 1: Parse all events + collect receipts ───────────────────────────

function pass1Parse(lines: string[]): {
    eventsByTray: Map<string, RawEvent[]>;
    receiptsByTray: Map<string, BarrelReceipt[]>;
    allOperationNames: Set<string>;
} {
    const eventsByTray = new Map<string, RawEvent[]>();
    const receiptsByTray = new Map<string, BarrelReceipt[]>();
    const allOperationNames = new Set<string>();

    const totalLines = lines.length;

    for (let i = 0; i < totalLines; i++) {
        // Progress reporting every 10k lines
        if (i > 0 && i % 10000 === 0) {
            const percent = Math.floor((i / totalLines) * 50);
            self.postMessage({ type: 'progress', percent, message: `Pass 1: ${i.toLocaleString()} / ${totalLines.toLocaleString()} lines` });
        }

        const line = lines[i];
        const parts = line.split('\t');
        if (parts.length < 11) continue;

        // Col 7 = scope (should be "Seq_Log_Analyzer" — agent already filtered)
        // Col 8 = operation name
        // Col 9 = event type
        // Col 10 = JSON metadata
        const operationName = parts[8];
        const eventType = parts[9] as 'START' | 'END' | 'SET';
        const jsonStr = parts[10];

        if (eventType !== 'START' && eventType !== 'END' && eventType !== 'SET') continue;

        let data: Record<string, unknown>;
        try {
            // Sanitize: The C++ logger writes raw Windows paths with unescaped
            // backslashes (e.g. "C:\LAI\..."). These are invalid JSON escapes.
            // Fix JSON paths with single backslashes (like C:\LAI\...)
            // 1) Replace all \\ with \ so we have a uniform base of single backslashes
            // 2) Replace all \ with \\ except those that are already valid JSON escapes
            const normalized = jsonStr.replace(/\\\\/g, '\\');
            const sanitized = normalized.replace(/\r$/, '').replace(/\\(?!["\\/bfnrtu])/g, '\\\\');
            data = JSON.parse(sanitized);
        } catch {
            continue;
        }

        const barrelTrayId = (data.barrelTrayId as string) ?? '';
        if (!barrelTrayId) continue;

        // Handle SET events
        if (eventType === 'SET') {
            if (isBarrelComplete(operationName)) {
                // Barrel_Complete receipt
                const receipt: BarrelReceipt = {
                    barrelId: (data.barrelId as number) ?? 0,
                    lensId: (data.lensId as number) ?? 0,
                    spacerId: (data.spacerId as number) ?? 0,
                };
                if (!receiptsByTray.has(barrelTrayId)) receiptsByTray.set(barrelTrayId, []);
                receiptsByTray.get(barrelTrayId)!.push(receipt);
            } else if (isNgEvent(data)) {
                // NG event — store as a raw event for matching in Pass 2
                const counter = detectCounterType(data);
                if (counter) {
                    const event: RawEvent = {
                        operationName,
                        eventType: 'SET',
                        barrelTrayId,
                        counterType: counter.type,
                        counterId: counter.id,
                        ngPath: data.ngPath as string,
                        ngCode: data.ngCode as string | undefined,
                    };
                    if (!eventsByTray.has(barrelTrayId)) eventsByTray.set(barrelTrayId, []);
                    eventsByTray.get(barrelTrayId)!.push(event);
                    allOperationNames.add(operationName);
                }
            }
            continue;
        }

        // Handle START / END events
        const counter = detectCounterType(data);
        if (!counter) continue;

        const event: RawEvent = {
            operationName,
            eventType,
            barrelTrayId,
            counterType: counter.type,
            counterId: counter.id,
        };

        if (eventType === 'START') {
            event.startTs = (data.startTs as number) ?? undefined;
        } else {
            event.endTs = (data.endTs as number) ?? undefined;
            event.idealMs = (data.idealMs as number) ?? undefined;
        }

        if (!eventsByTray.has(barrelTrayId)) eventsByTray.set(barrelTrayId, []);
        eventsByTray.get(barrelTrayId)!.push(event);
        allOperationNames.add(operationName);
    }

    return { eventsByTray, receiptsByTray, allOperationNames };
}

// ─── PASS 2: Match operations + map to barrels ────────────────────────────

function pass2MapToBarrels(
    eventsByTray: Map<string, RawEvent[]>,
    receiptsByTray: Map<string, BarrelReceipt[]>,
): BarrelTray[] {
    const trays: BarrelTray[] = [];
    const trayIds = Array.from(new Set([...eventsByTray.keys(), ...receiptsByTray.keys()]));

    let processedTrays = 0;
    const totalTrays = trayIds.length;

    for (const trayId of trayIds) {
        processedTrays++;
        const percent = 50 + Math.floor((processedTrays / totalTrays) * 40);
        self.postMessage({ type: 'progress', percent, message: `Pass 2: Building tray ${processedTrays} / ${totalTrays}` });

        const events = eventsByTray.get(trayId) ?? [];
        const receipts = (receiptsByTray.get(trayId) ?? []).sort((a, b) => a.barrelId - b.barrelId);

        // ─── Step 1: Match START/END pairs into Operations ─────────
        // Match by operationName+barrelTrayId (NOT counterId) because:
        // - NG retries can change the counterId between START and END
        // - A START without matching END = NG attempt (SET with ngPath exists)
        // - Multiple instances of same operation per barrel are supported
        const pendingStarts = new Map<string, RawEvent[]>(); // key: `${opName}_${counterType}` → queue of STARTs
        const matchedOps: OperationData[] = [];
        // Collect all NG SET events indexed by opName+counterType for attachment
        const ngEventsByOp = new Map<string, RawEvent[]>();

        for (const ev of events) {
            const matchKey = `${ev.operationName}_${ev.counterType}`;

            if (ev.eventType === 'SET') {
                // NG event — collect for attachment to operations
                if (!ngEventsByOp.has(matchKey)) ngEventsByOp.set(matchKey, []);
                ngEventsByOp.get(matchKey)!.push(ev);
                continue;
            }

            if (ev.eventType === 'START') {
                // Push onto the queue for this opName+counterType
                if (!pendingStarts.has(matchKey)) pendingStarts.set(matchKey, []);
                pendingStarts.get(matchKey)!.push(ev);
                continue;
            }

            // END event — match with the OLDEST pending START for same opName+counterType
            if (ev.eventType === 'END') {
                const startQueue = pendingStarts.get(matchKey);
                if (!startQueue || startQueue.length === 0) continue;

                // Take the oldest START
                const startEv = startQueue.shift()!;
                if (startEv.startTs === undefined || ev.endTs === undefined) continue;

                // Check if any NG SET events occurred for this operation between START and END
                const ngEventsForOp = ngEventsByOp.get(matchKey) || [];
                // Find NG events with counterId between startEv.counterId and ev.counterId (inclusive of start)
                const relevantNgEvents = ngEventsForOp.filter(ng =>
                    ng.counterId >= startEv.counterId && ng.counterId < ev.counterId
                );
                const ngEv = relevantNgEvents.length > 0 ? relevantNgEvents[0] : null;

                const op: OperationData = {
                    operationName: ev.operationName,
                    hierarchy: buildHierarchy(ev.operationName),
                    counterType: ev.counterType,
                    // Use the START's counterId for barrel ownership mapping
                    counterId: startEv.counterId,
                    startTs: startEv.startTs,
                    endTs: ev.endTs,
                    duration: ev.endTs - startEv.startTs,
                    idealMs: ev.idealMs,
                    barrelTrayId: trayId,
                    isNg: !!ngEv,
                    ngPath: ngEv?.ngPath,
                    ngCode: ngEv?.ngCode,
                };

                matchedOps.push(op);

                // Any remaining STARTs in the queue for this key that have counterId < ev.counterId
                // are NG attempts that never got their own END → create NG operation entries for them
                if (startQueue.length > 0) {
                    const unmatched: RawEvent[] = [];
                    const stillPending: RawEvent[] = [];
                    for (const s of startQueue) {
                        if (s.counterId < ev.counterId) {
                            unmatched.push(s);
                        } else {
                            stillPending.push(s);
                        }
                    }
                    pendingStarts.set(matchKey, stillPending);

                    // Create NG operation entries for unmatched STARTs
                    for (const unmatchedStart of unmatched) {
                        if (unmatchedStart.startTs === undefined) continue;
                        const unmatchedNg = ngEventsForOp.find(ng => ng.counterId === unmatchedStart.counterId);
                        if (unmatchedNg) {
                            matchedOps.push({
                                operationName: unmatchedStart.operationName,
                                hierarchy: buildHierarchy(unmatchedStart.operationName),
                                counterType: unmatchedStart.counterType,
                                counterId: unmatchedStart.counterId,
                                startTs: unmatchedStart.startTs,
                                endTs: ev.endTs, // Use the END event's timestamp as this NG attempt's end
                                duration: ev.endTs - unmatchedStart.startTs,
                                idealMs: ev.idealMs,
                                barrelTrayId: trayId,
                                isNg: true,
                                ngPath: unmatchedNg.ngPath,
                                ngCode: unmatchedNg.ngCode,
                            });
                        }
                    }
                }
            }
        }

        // ─── Step 2: Assign operations to barrels via range ownership ──
        const barrels: Barrel[] = [];
        const trayOperations: OperationData[] = [];

        if (receipts.length === 0) {
            // No receipts — mark tray as incomplete, put all ops as tray-level
            trayOperations.push(...matchedOps);
        } else {
            // Build barrels with range ownership
            for (let bi = 0; bi < receipts.length; bi++) {
                const receipt = receipts[bi];
                const prevReceipt = bi > 0 ? receipts[bi - 1] : null;

                const lensStart = prevReceipt ? prevReceipt.lensId + 1 : 0;
                const lensEnd = receipt.lensId;
                const spacerStart = prevReceipt ? prevReceipt.spacerId + 1 : 0;
                const spacerEnd = receipt.spacerId;

                const barrelOps: OperationData[] = [];

                for (const op of matchedOps) {
                    let assigned = false;

                    if (op.counterType === 'barrelId' && op.counterId === receipt.barrelId) {
                        assigned = true;
                    } else if (op.counterType === 'lensId' && op.counterId >= lensStart && op.counterId <= lensEnd) {
                        assigned = true;
                    } else if (op.counterType === 'spacerId' && op.counterId >= spacerStart && op.counterId <= spacerEnd) {
                        assigned = true;
                    }

                    if (op.operationName === 'Sequence_Lens_Tray_Align') {
                        console.log(`[WORKER DEBUG] Barrel ${receipt.barrelId} check for LTA counterId ${op.counterId} (lensRange: [${lensStart}, ${lensEnd}]) -> assigned: ${assigned}`);
                    }

                    if (assigned) {
                        barrelOps.push(op);
                    }
                }

                barrelOps.sort((a, b) => a.startTs - b.startTs);

                let barrelAlignStartTs = Infinity;
                for (const op of barrelOps) {
                    if (op.operationName.startsWith('Sequence_Barrel_Align_') && op.startTs < barrelAlignStartTs) {
                        barrelAlignStartTs = op.startTs;
                    }
                }

                const prevBarrelEndTs = bi > 0 && barrels[bi - 1].operations.length > 0 
                    ? Math.max(...barrels[bi - 1].operations.map(o => o.endTs)) 
                    : 0;

                const minStartTs = barrelOps.length > 0 ? Math.min(...barrelOps.map(o => o.startTs)) : 0;
                const maxEndTs = barrelOps.length > 0 ? Math.max(...barrelOps.map(o => o.endTs)) : 0;

                let effectiveStartTs = barrelAlignStartTs;
                if (effectiveStartTs === Infinity) {
                    effectiveStartTs = prevBarrelEndTs > 0 ? prevBarrelEndTs : minStartTs;
                }

                // If effectiveStartTs is later than maxEndTs (e.g. abort cases), fallback safely
                if (effectiveStartTs > maxEndTs && maxEndTs > 0) {
                    effectiveStartTs = minStartTs;
                }

                const totalDuration = maxEndTs > effectiveStartTs ? maxEndTs - effectiveStartTs : 0;

                barrels.push({
                    barrelId: receipt.barrelId,
                    barrelTrayId: trayId,
                    receipt,
                    operations: barrelOps,
                    lensRange: [lensStart, lensEnd],
                    spacerRange: [spacerStart, spacerEnd],
                    totalDuration,
                    barrelAlignStartTs: effectiveStartTs,
                });
            }

            // Tray-level operations: those with lensTrayId or unassigned
            const assignedOps = new Set(barrels.flatMap(b => b.operations));
            for (const op of matchedOps) {
                if (!assignedOps.has(op) && isTrayLevelOp(op.counterType)) {
                    trayOperations.push(op);
                }
            }
        }

        barrels.sort((a, b) => a.barrelId - b.barrelId);
        trayOperations.sort((a, b) => a.startTs - b.startTs);

        const allOps = [...barrels.flatMap(b => b.operations), ...trayOperations];
        const trayDuration = allOps.length > 0
            ? Math.max(...allOps.map(o => o.endTs)) - Math.min(...allOps.map(o => o.startTs))
            : 0;

        trays.push({
            barrelTrayId: trayId,
            barrels,
            trayOperations,
            totalDuration: trayDuration,
            isIncomplete: receipts.length === 0,
        });
    }

    return trays;
}

// ─── Main parse function ───────────────────────────────────────────────────

function parseLogContent(content: string, fileName?: string): AnalysisResult {
    const lines = content.trim().split('\n');

    self.postMessage({ type: 'progress', percent: 0, message: `Parsing ${lines.length.toLocaleString()} lines...` });

    // Pass 1
    const { eventsByTray, receiptsByTray, allOperationNames } = pass1Parse(lines);

    // Pass 2
    const trays = pass2MapToBarrels(eventsByTray, receiptsByTray);

    self.postMessage({ type: 'progress', percent: 95, message: 'Calculating statistics...' });

    // Summary
    const allBarrels = trays.flatMap(t => t.barrels);
    const executionTimes = allBarrels.map(b => b.totalDuration);

    const summary = {
        totalTrays: trays.length,
        totalBarrels: allBarrels.length,
        averageExecutionTime: executionTimes.length > 0
            ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length
            : 0,
        minExecutionTime: executionTimes.length > 0
            ? Math.min(...executionTimes)
            : 0,
        maxExecutionTime: executionTimes.length > 0
            ? Math.max(...executionTimes)
            : 0,
    };

    self.postMessage({ type: 'progress', percent: 100, message: 'Complete!' });

    return {
        trays,
        allOperationNames: Array.from(allOperationNames).sort(),
        summary,
        fileName,
    };
}

// ─── Worker message handler ────────────────────────────────────────────────

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

export {};
