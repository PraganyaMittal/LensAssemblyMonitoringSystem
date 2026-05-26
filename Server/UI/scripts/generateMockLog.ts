import * as fs from 'fs';
import * as path from 'path';

let globalLensId = 0;
let globalSpacerId = 0;
let currentTs = 100000;

function ts(ms: number) {
    currentTs += ms;
    return currentTs;
}

function formatTime(tsMs: number) {
    // 100000 = 100s
    // Base time: 2026-05-21 12:00:00.000
    const base = new Date('2026-05-21T12:00:00.000Z').getTime();
    const d = new Date(base + tsMs);
    return d.toISOString().replace('T', ' ').replace('Z', '').substring(0, 23);
}

const lines: string[] = [];

function log(op: string, type: 'START'|'END'|'SET', data: any, delay: number = 0) {
    if (delay > 0) ts(delay);
    const timeStr = formatTime(currentTs);
    lines.push(`${timeStr}\tEQP_B1015036_TEST\tA\t-\tDEFAULT_MODEL\tProductID\tRUN\tSeq_Log_Analyzer\t${op}\t${type}\t${JSON.stringify(data)}`);
}

function simulateBarrel(trayId: string, barrelId: number, options: { 
    lensNgAt?: number, // number of times to fail lens align
    maskNgAt?: number, // number of times to fail mask pickup
    barrelAlignLensFail?: boolean,
    barrelAlignMaskFail?: boolean
} = {}) {
    // 1. Barrel Align Lens
    log('Sequence_Barrel_Align_Lens', 'START', { category: "barrel", barrelTrayId: trayId, barrelId, startTs: currentTs }, 500);
    log('Sequence_Barrel_Align_Lens', 'END', { category: "barrel", barrelTrayId: trayId, barrelId, idealMs: 1000, endTs: currentTs + 1000 }, 1000);
    
    if (options.barrelAlignLensFail) {
        log('Sequence_Barrel_Align_Lens', 'SET', { category: "barrel", barrelTrayId: trayId, barrelId, ngCode: "Barrel Tilted" });
        return; // Skip rest of barrel
    }

    // 2. Lens Tray Align (with optional retries)
    let lRetries = options.lensNgAt || 0;
    const startLensId = globalLensId;
    log('Sequence_Lens_Tray_Align', 'START', { category: "barrel", barrelTrayId: trayId, lensId: startLensId, startTs: currentTs }, 100);
    
    while (lRetries >= 0) {
        if (lRetries > 0) {
            log('Sequence_Lens_Tray_Align', 'SET', { 
                category: "barrel", barrelTrayId: trayId, lensId: globalLensId, 
                ngPath: "C:\\LAI\\LAI-WorkData\\ImageData\\2026\\05\\20\\DEFAULT_MODEL\\Cam_LensOver\\LensOverAlgin\\Lens_Tray_20260520_174944\\NO_LENS_CIRCLE#2026-05-20#17;49;46;948#Lens Over#_1_FAIL.BMP",
                ngCode: "No Lens Circle" 
            }, 500);
            globalLensId++;
            lRetries--;
        } else {
            log('Sequence_Lens_Tray_Align', 'END', { category: "barrel", barrelTrayId: trayId, lensId: globalLensId, idealMs: 1000, endTs: currentTs + 1000 }, 1000);
            globalLensId++;
            break;
        }
    }

    const activeLens = globalLensId - 1;

    // 3. Mask Pickup
    let mRetries = options.maskNgAt || 0;
    const startMaskId = globalSpacerId;
    log('Sequence_Mask_Pickup', 'START', { category: "barrel", barrelTrayId: trayId, spacerId: startMaskId, startTs: currentTs }, 100);

    while (mRetries >= 0) {
        if (mRetries > 0) {
            log('Sequence_Mask_Pickup', 'SET', { 
                category: "barrel", barrelTrayId: trayId, spacerId: globalSpacerId, 
                ngPath: "C:\\LAI\\LAI-WorkData\\ImageData\\2026\\05\\20\\DEFAULT_MODEL\\Cam_LensOver\\LensOverAlgin\\Lens_Tray_20260520_174944\\NO_LENS_CIRCLE#2026-05-20#17;49;46;948#Lens Over#_1_FAIL.BMP",
                ngCode: "Spacer Flipped" 
            }, 500);
            globalSpacerId++;
            mRetries--;
        } else {
            log('Sequence_Mask_Pickup', 'END', { category: "barrel", barrelTrayId: trayId, spacerId: globalSpacerId, idealMs: 1000, endTs: currentTs + 800 }, 800);
            globalSpacerId++;
            break;
        }
    }
    const activeMask = globalSpacerId - 1;

    // 4. Lens Pickup
    log('Sequence_Lens_Pickup', 'START', { category: "barrel", barrelTrayId: trayId, lensId: activeLens, startTs: currentTs }, 50);
    log('Sequence_Lens_Pickup', 'END', { category: "barrel", barrelTrayId: trayId, lensId: activeLens, idealMs: 1000, endTs: currentTs + 400 }, 400);

    // 5. Lens Align
    log('Sequence_Lens_Align', 'START', { category: "barrel", barrelTrayId: trayId, lensId: activeLens, startTs: currentTs }, 50);
    log('Sequence_Lens_Align', 'END', { category: "barrel", barrelTrayId: trayId, lensId: activeLens, idealMs: 1000, endTs: currentTs + 900 }, 900);

    // 6. Mask Align
    log('Sequence_Mask_Align', 'START', { category: "barrel", barrelTrayId: trayId, spacerId: activeMask, startTs: currentTs }, 50);
    log('Sequence_Mask_Align', 'END', { category: "barrel", barrelTrayId: trayId, spacerId: activeMask, idealMs: 1000, endTs: currentTs + 900 }, 900);

    // 7. Lens Insert
    log('Sequence_Lens_Insert', 'START', { category: "barrel", barrelTrayId: trayId, lensId: activeLens, startTs: currentTs }, 50);
    log('Sequence_Lens_Insert', 'END', { category: "barrel", barrelTrayId: trayId, lensId: activeLens, idealMs: 1000, endTs: currentTs + 1100 }, 1100);

    // 8. Barrel Align Mask
    log('Sequence_Barrel_Align_Mask', 'START', { category: "barrel", barrelTrayId: trayId, barrelId, startTs: currentTs }, 50);
    log('Sequence_Barrel_Align_Mask', 'END', { category: "barrel", barrelTrayId: trayId, barrelId, idealMs: 1000, endTs: currentTs + 950 }, 950);

    if (options.barrelAlignMaskFail) {
        log('Sequence_Barrel_Align_Mask', 'SET', { category: "barrel", barrelTrayId: trayId, barrelId, ngCode: "Barrel Tilted" });
        return; // Skip mask insert
    }

    // 9. Mask Insert
    log('Sequence_Mask_Insert', 'START', { category: "barrel", barrelTrayId: trayId, spacerId: activeMask, startTs: currentTs }, 50);
    log('Sequence_Mask_Insert', 'END', { category: "barrel", barrelTrayId: trayId, spacerId: activeMask, idealMs: 1000, endTs: currentTs + 1200 }, 1200);

    // 10. Complete
    log('Sequence_Barrel_Complete', 'SET', { category: "barrel", barrelTrayId: trayId, barrelId, lensId: activeLens, spacerId: activeMask }, 50);
}

// Tray 1: Perfect Happy Path
const t1 = "20260521_120000";
for(let i=0; i<4; i++) simulateBarrel(t1, i);

// Tray 2: Mix of NGs (The one we will view in UI)
const t2 = "20260521_123000";
simulateBarrel(t2, 0); // Happy
simulateBarrel(t2, 1, { lensNgAt: 3 }); // Lens NG retry 3 times
simulateBarrel(t2, 2, { maskNgAt: 1 }); // Mask NG retry
simulateBarrel(t2, 3, { barrelAlignLensFail: true }); // Barrel NG (skips rest)

// Tray 3: Another Mix
const t3 = "20260521_130000";
simulateBarrel(t3, 0); 
simulateBarrel(t3, 1, { barrelAlignMaskFail: true }); // Fails at mask align
simulateBarrel(t3, 2); 
simulateBarrel(t3, 3); 

fs.writeFileSync('C:/LAI/LAI-WorkData/Log/General/2026/05/21/2026052120_GeneralLog.log', lines.join('\n') + '\n');
console.log("Generated realistic log file with 9 operations per barrel!");
