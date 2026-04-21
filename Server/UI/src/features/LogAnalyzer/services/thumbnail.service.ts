
import {
    ThumbnailData,
    ThumbnailResponse,
    ThumbnailResponseSchema,
    ThumbnailAvailabilityResponseSchema,
    validateWithFallback,
} from '../types/log.schemas';

const API_BASE = '/api';

export const thumbnailService = {
    
    async getThumbnails(logFileName: string): Promise<ThumbnailResponse | null> {
        try {
            const response = await fetch(`${API_BASE}/thumbnail/${logFileName}`);
            if (!response.ok) {
                if (response.status === 404) return null;
                throw new Error('Failed to fetch thumbnails');
            }
            const data = await response.json();
            return validateWithFallback(
                ThumbnailResponseSchema,
                data,
                'ThumbnailResponse'
            );
        } catch (error) {
            console.error('Error fetching thumbnails:', error);
            return null;
        }
    },

    async getThumbnailsForOperation(
        logFileName: string,
        operationName: string
    ): Promise<ThumbnailData[]> {
        try {
            const response = await fetch(
                `${API_BASE}/thumbnail/${logFileName}/operation/${encodeURIComponent(operationName)}`
            );
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
            const data = await response.json();
            const validated = validateWithFallback(
                ThumbnailAvailabilityResponseSchema,
                data,
                'ThumbnailAvailability'
            );
            return validated.available;
        } catch {
            return false;
        }
    },

    getLogFileName(filePath: string): string {
        return filePath.split(/[\\/]/).pop() || filePath;
    },
};

export default thumbnailService;
