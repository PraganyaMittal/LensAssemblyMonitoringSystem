
/**
 * Log Parser Web Worker
 *
 * Thin shell — all parsing logic lives in logParserCore.ts.
 * This file only handles the Worker message protocol:
 *   - Receives { type: 'parse', content, fileName }
 *   - Sends { type: 'progress', percent, message }
 *   - Sends { type: 'success', result }
 *   - Sends { type: 'error', error }
 */

import { parseLogContent } from '../utils/logParserCore';

self.onmessage = (event: MessageEvent) => {
    const { type, content, fileName } = event.data;

    if (type !== 'parse') return;

    try {
        const result = parseLogContent(
            content,
            fileName,
            (percent: number, message: string) => {
                self.postMessage({ type: 'progress', percent, message });
            }
        );

        self.postMessage({ type: 'success', result });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        self.postMessage({ type: 'error', error: message });
    }
};
