

const API_BASE = '/api';

export interface ThumbnailData {
    operationName: string;
    ngPath: string;
    filename: string;
    data: string; 
}

export interface ThumbnailResponse {
    logFileName: string;
    thumbnails: ThumbnailData[];
    count: number;
}

export interface ThumbnailAvailabilityResponse {
    logFileName: string;
    available: boolean;
}

export const thumbnailApi = {
    
    async getThumbnails(logFileName: string): Promise<ThumbnailResponse | null> {
        try {
            const response = await fetch(`${API_BASE}/thumbnail/${logFileName}`);
            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error('Failed to fetch thumbnails');
            }
            return await response.json();
        } catch (error) {
            console.error('Error fetching thumbnails:', error);
            return null;
        }
    },

    async getThumbnailsForOperation(
        logFileName: string,
        operationName: string,
        barrelId?: string,
        barrelTrayId?: string
    ): Promise<ThumbnailData[]> {
        try {
            let url = `${API_BASE}/thumbnail/${logFileName}/operation/${encodeURIComponent(operationName)}`;
            const params = new URLSearchParams();
            if (barrelId !== undefined) params.set('barrelId', barrelId);
            if (barrelTrayId) params.set('barrelTrayId', barrelTrayId);
            if (params.toString()) url += `?${params.toString()}`;
            const response = await fetch(url);
            if (!response.ok) return [];
            const data = await response.json();
            return data.thumbnails || [];
        } catch (error) {
            console.error('Error fetching operation thumbnails:', error);
            return [];
        }
    },

    async checkAvailability(logFileName: string): Promise<boolean> {
        try {
            const response = await fetch(`${API_BASE}/thumbnail/${logFileName}/available`);
            if (!response.ok) return false;
            const data: ThumbnailAvailabilityResponse = await response.json();
            return data.available;
        } catch (error) {
            return false;
        }
    },

    getLogFileName(filePath: string): string {
        return filePath.split(/[\\/]/).pop() || filePath;
    }
};

export default thumbnailApi;
