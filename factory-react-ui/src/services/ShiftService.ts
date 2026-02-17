import { api } from './api';

export interface ShiftSummary {
    shiftName: string; // "Day" or "Night"
    startTime: string; // ISO DateTime
    endTime: string;   // ISO DateTime
    totalProcessed: number;
    totalGood: number;
    averageYield: number;
    trayCount: number;
}

export interface DailyShiftSummary {
    date: string; // ISO Date
    dayShift: ShiftSummary;
    nightShift: ShiftSummary;
}

export const ShiftService = {
    getCurrentShift: async (): Promise<ShiftSummary> => {
        const { data } = await api.get('/Shift/current');
        return data;
    },

    getShiftSummary: async (date: Date): Promise<DailyShiftSummary> => {
        // Format date as YYYY-MM-DD to avoid timezone issues with API
        const dateStr = date.toISOString().split('T')[0];
        const { data } = await api.get(`/Shift/summary?date=${dateStr}`);
        return data;
    }
};
