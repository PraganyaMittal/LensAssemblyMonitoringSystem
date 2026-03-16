
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import type { DailySummary, TrayRecord } from './YieldService';

export interface YieldExportData {
    mcName: string;
    dailySummaries: DailySummary[];
    trayData?: Record<string, TrayRecord[]>;
}

export function exportYieldToExcel(data: YieldExportData): void {
    const workbook = XLSX.utils.book_new();

    const summaryData = data.dailySummaries.map(d => ({
        'Date': d.date,
        'Tray Count': d.trayCount,
        'Good Count': d.totalGood,
        'Total Count': d.totalCount,
        'Yield (%)': Number(d.avgYield.toFixed(1))
    }));

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

    summarySheet['!cols'] = [
        { wch: 12 }, 
        { wch: 12 }, 
        { wch: 12 }, 
        { wch: 12 }, 
        { wch: 10 }  
    ];

    XLSX.utils.book_append_sheet(workbook, summarySheet, 'Daily Summary');

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
                { wch: 12 }, 
                { wch: 20 }, 
                { wch: 8 },  
                { wch: 8 },  
                { wch: 10 } 
            ];
            XLSX.utils.book_append_sheet(workbook, traySheet, 'Tray Details');
        }
    }

    const today = new Date().toISOString().split('T')[0];
    const filename = `Yield_${data.mcName}_${today}.xlsx`;

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    saveAs(blob, filename);
}
