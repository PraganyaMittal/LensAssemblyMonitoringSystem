import { api } from './api';

export interface ShiftSummary {
    shiftName: string; 
    startTime: string; 
    endTime: string;   
    totalProcessed: number;
    totalGood: number;
    averageYield: number;
    trayCount: number;
}

export interface DailyShiftSummary {
    date: string; 
    dayShift: ShiftSummary;
    nightShift: ShiftSummary;
}

export const ShiftService = {
    getCurrentShift: async (): Promise<ShiftSummary> => {
        const { data } = await api.get('/Shift/current');
        return data;
    },

    getShiftSummary: async (date: Date): Promise<DailyShiftSummary> => {
        
        const dateStr = date.toISOString().split('T')[0];
        const { data } = await api.get(`/Shift/summary?date=${dateStr}`);
        return data;
    }
};
