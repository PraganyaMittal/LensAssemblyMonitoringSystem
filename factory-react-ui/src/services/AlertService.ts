import { api } from './api';

export interface YieldAlert {
    id: number;
    machineId: number;
    machineName: string;
    lineNumber: number;
    currentYield: number;
    threshold: number;
    createdAt: string;
    isActive: boolean;
    isAcknowledged: boolean;
    acknowledgedAt?: string;
    resolvedAt?: string;
    dateRangeStart?: string;
    dateRangeEnd?: string;
}

export interface YieldAlertSettings {
    threshold: number;
    cooldownMinutes: number;
    historyDays: number;
    dateMode?: string;
    customFrom?: string;
    customTo?: string;
}

export const AlertService = {
    getActiveAlerts: async (): Promise<YieldAlert[]> => {
        const { data } = await api.get('/YieldAlert/active');
        return data;
    },

    getHistory: async (days: number): Promise<YieldAlert[]> => {
        const { data } = await api.get(`/YieldAlert/history?days=${days}`);
        return data;
    },

    acknowledge: async (id: number): Promise<YieldAlert> => {
        const { data } = await api.post(`/YieldAlert/acknowledge/${id}`);
        return data;
    },

    unacknowledge: async (id: number): Promise<YieldAlert> => {
        const { data } = await api.post(`/YieldAlert/unacknowledge/${id}`);
        return data;
    },

    getSettings: async (): Promise<YieldAlertSettings> => {
        const { data } = await api.get('/YieldAlert/settings');
        return data;
    },

    updateSettings: async (settings: YieldAlertSettings): Promise<YieldAlertSettings> => {
        const { data } = await api.post('/YieldAlert/settings', settings);
        return data;
    },

    delete: async (id: number): Promise<void> => {
        await api.post(`/YieldAlert/delete/${id}`);
    },

    clearAll: async (): Promise<void> => {
        await api.post('/YieldAlert/clear-all');
    }
};
