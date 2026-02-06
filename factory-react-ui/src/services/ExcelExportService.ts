/**
 * ExcelExport Utility - Export yield data to Excel
 */
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { DailySummary, TrayRecord } from './YieldService';

export interface YieldExportData {
    mcName: string;
    dailySummaries: DailySummary[];
    trayData?: Record<string, TrayRecord[]>;
}

/**
 * Export yield history to Excel file
 */
export function exportYieldToExcel(data: YieldExportData): void {
    const workbook = XLSX.utils.book_new();

    // Sheet 1: Daily Summary
    const summaryData = data.dailySummaries.map(d => ({
        'Date': d.date,
        'Tray Count': d.trayCount,
        'Good Count': d.totalGood,
        'Total Count': d.totalCount,
        'Yield (%)': Number(d.avgYield.toFixed(1))
    }));

    // Add totals row
    const totalGood = data.dailySummaries.reduce((s, d) => s + d.totalGood, 0);
    const totalCount = data.dailySummaries.reduce((s, d) => s + d.totalCount, 0);
    const totalTrays = data.dailySummaries.reduce((s, d) => s + d.trayCount, 0);
    const overallYield = totalCount > 0 ? (totalGood / totalCount) * 100 : 0;

    summaryData.push({
        'Date': 'TOTAL',
        'Tray Count': totalTrays,
        'Good Count': totalGood,
        'Total Count': totalCount,
        'Yield (%)': Number(overallYield.toFixed(1))
    });

    const summarySheet = XLSX.utils.json_to_sheet(summaryData);

    // Set column widths
    summarySheet['!cols'] = [
        { wch: 12 }, // Date
        { wch: 12 }, // Tray Count
        { wch: 12 }, // Good Count
        { wch: 12 }, // Total Count
        { wch: 10 }  // Yield
    ];

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Daily Summary');

    // Sheet 2: Tray Details (if available)
    if (data.trayData && Object.keys(data.trayData).length > 0) {
        const trayRows: { Date: string; 'Tray ID': string; Good: number; Total: number; 'Yield (%)': number }[] = [];

        Object.entries(data.trayData).forEach(([date, trays]) => {
            trays.forEach(tray => {
                trayRows.push({
                    'Date': date,
                    'Tray ID': tray.trayId,
                    'Good': tray.goodCount,
                    'Total': tray.totalCount,
                    'Yield (%)': Number(tray.yieldPercentage.toFixed(1))
                });
            });
        });

        if (trayRows.length > 0) {
            const traySheet = XLSX.utils.json_to_sheet(trayRows);
            traySheet['!cols'] = [
                { wch: 12 }, // Date
                { wch: 20 }, // Tray ID
                { wch: 8 },  // Good
                { wch: 8 },  // Total
                { wch: 10 } // Yield
            ];
            XLSX.utils.book_append_sheet(workbook, traySheet, 'Tray Details');
        }
    }

    // Generate filename with date
    const today = new Date().toISOString().split('T')[0];
    const filename = `Yield_${data.mcName}_${today}.xlsx`;

    // Export
    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, filename);
}
