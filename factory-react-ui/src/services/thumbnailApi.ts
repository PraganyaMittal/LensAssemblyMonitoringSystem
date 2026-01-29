/**
 * Thumbnail API service for fetching cached thumbnails from the server.
 */

const API_BASE = '/api';

export interface ThumbnailData {
    operationName: string;
    imagePath: string;
    filename: string;
    data: string; // Base64 encoded JPEG
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
    /**
     * Get all thumbnails for a log file.
     */
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

    /**
     * Get thumbnails for a specific operation.
     * Optionally filter by barrelId to only get images for a specific barrel.
     */
    async getThumbnailsForOperation(
        logFileName: string,
        operationName: string,
        barrelId?: string
    ): Promise<ThumbnailData[]> {
        try {
            let url = `${API_BASE}/thumbnail/${logFileName}/operation/${encodeURIComponent(operationName)}`;
            if (barrelId !== undefined) {
                url += `?barrelId=${encodeURIComponent(barrelId)}`;
            }
            const response = await fetch(url);
            if (!response.ok) return [];
            const data = await response.json();
            return data.thumbnails || [];
        } catch (error) {
            console.error('Error fetching operation thumbnails:', error);
            return [];
        }
    },

    /**
     * Check if thumbnails are available for a log file.
     */
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

    /**
     * Get filename from path (UI equivalent of Agent logic)
     */
    getLogFileName(filePath: string): string {
        return filePath.split(/[\\/]/).pop() || filePath;
    }
};

export default thumbnailApi;
