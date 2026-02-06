
export interface YieldSummary {
    [machineId: number]: number; // Yield Percentage
}

export interface YieldHistoryRecord {
    trayId: string;
    date: string;  // Date-only string from backend (e.g., "2026-02-05")
    goodCount: number;
    totalCount: number;
    yieldPercentage: number;
}

// Daily aggregated summary (efficient for large date ranges)
export interface DailySummary {
    date: string;
    trayCount: number;
    totalGood: number;
    totalCount: number;
    avgYield: number;
}

// Tray record without date (used when fetching for a specific date)
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

    // Legacy: Fetch all tray records at once (use only for small date ranges)
    getHistory: async (mcId: number, start?: string, end?: string): Promise<YieldHistoryRecord[]> => {
        const query = new URLSearchParams();
        if (start) query.append('start', start);
        if (end) query.append('end', end);

        const response = await fetch(`/api/Yield/history/${mcId}?${query.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch yield history');
        return response.json();
    },

    // NEW: Fetch daily aggregated summaries (efficient for large date ranges)
    getHistorySummary: async (mcId: number, start?: string, end?: string): Promise<DailySummary[]> => {
        const query = new URLSearchParams();
        if (start) query.append('start', start);
        if (end) query.append('end', end);

        const response = await fetch(`/api/Yield/history/${mcId}/summary?${query.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch history summary');
        return response.json();
    },

    // NEW: Fetch tray details for a specific date (lazy-load on expand)
    getHistoryByDate: async (mcId: number, date: string): Promise<TrayRecord[]> => {
        const response = await fetch(`/api/Yield/history/${mcId}/date/${date}`);
        if (!response.ok) throw new Error('Failed to fetch trays for date');
        return response.json();
    }
};
