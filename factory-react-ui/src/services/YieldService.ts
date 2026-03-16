
export interface YieldSummary {
    [machineId: number]: number; 
}

export interface YieldHistoryRecord {
    trayId: string;
    date: string;  
    goodCount: number;
    totalCount: number;
    yieldPercentage: number;
}

export interface DailySummary {
    date: string;
    trayCount: number;
    totalGood: number;
    totalCount: number;
    avgYield: number;
}

export interface TrayRecord {
    trayId: string;
    goodCount: number;
    totalCount: number;
    yieldPercentage: number;
}

export const YieldService = {
    getSummary: async (start?: string, end?: string): Promise<YieldSummary> => {
        const query = new URLSearchParams();
        if (start) query.append('start', start);
        if (end) query.append('end', end);

        const response = await fetch(`/api/Yield/summary?${query.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch yield summary');
        return response.json();
    },

    getHistory: async (mcId: number, start?: string, end?: string): Promise<YieldHistoryRecord[]> => {
        const query = new URLSearchParams();
        if (start) query.append('start', start);
        if (end) query.append('end', end);

        const response = await fetch(`/api/Yield/history/${mcId}?${query.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch yield history');
        return response.json();
    },

    getHistorySummary: async (mcId: number, start?: string, end?: string): Promise<DailySummary[]> => {
        const query = new URLSearchParams();
        if (start) query.append('start', start);
        if (end) query.append('end', end);

        const response = await fetch(`/api/Yield/history/${mcId}/summary?${query.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch history summary');
        return response.json();
    },

    getHistoryByDate: async (mcId: number, date: string): Promise<TrayRecord[]> => {
        const response = await fetch(`/api/Yield/history/${mcId}/date/${date}`);
        if (!response.ok) throw new Error('Failed to fetch trays for date');
        return response.json();
    }
};
