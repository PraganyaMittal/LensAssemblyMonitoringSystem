const fs = require('fs');

const path = 'src/features/LogAnalyzer/utils/logParser.ts';
let code = fs.readFileSync(path, 'utf8');

// 1. Update signature
code = code.replace(
    'export function parseLogContent(content: string, fileName?: string): AnalysisResult {',
    `export function parseLogContent(
    content: string, 
    fileName?: string,
    onProgressCallback?: (percent: number, message: string) => void
): AnalysisResult {
    const reportProgress = (percent: number, message: string) => {
        if (onProgressCallback) {
            onProgressCallback(percent, message);
        }
    };`
);

// 2. Replace self.postMessage calls with reportProgress
code = code.replace(/self\.postMessage\(\{ type: 'progress', percent(: (\d+))?, message: (.*?)\ \}\);/g, (match, p1, percentVal, message) => {
    // If it's `percent: 95`, p1 is `: 95`, percentVal is `95`.
    // If it's just `percent`, p1 is undefined.
    let p = percentVal !== undefined ? percentVal : 'percent';
    return `reportProgress(${p}, ${message});`;
});

// Also replace the single occurrence that doesn't fit the regex exactly if any:
// It looks like: self.postMessage({ type: 'progress', percent: 70 + Math.floor(...), message: `...` })
code = code.replace(/self\.postMessage\(\{ type: 'progress', percent: (.*?), message: (.*?)\ \}\);/g, 'reportProgress($1, $2);');

fs.writeFileSync(path, code);
console.log('Fixed logParser.ts');
