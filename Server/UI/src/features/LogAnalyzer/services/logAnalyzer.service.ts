
import {
    LogFileContent,
    InspectionImageRequest,
    InspectionImageResponse,
    LogFileContentSchema,
    InspectionImageResponseSchema,
    validateApiResponse,
} from '../types/log.schemas';

const API_BASE = '/api';

export const logAnalyzerService = {

    async getLogFileContent(
        mcId: number,
        filePath: string,
        signal?: AbortSignal
    ): Promise<LogFileContent> {
        const response = await fetch(`${API_BASE}/LogAnalyzer/file/${mcId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath }),
            signal,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({
                error: response.statusText
            }));
            throw new Error(
                error.error || `Failed to fetch log file: ${response.statusText}`
            );
        }

        const data = await response.json();
        return validateApiResponse(LogFileContentSchema, data, 'LogFileContent');
    },

    async getInspectionImages(
        mcId: number,
        request: InspectionImageRequest,
        signal?: AbortSignal
    ): Promise<InspectionImageResponse> {
        const response = await fetch(`${API_BASE}/LogAnalyzer/images/${mcId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
            signal,
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({
                error: response.statusText
            }));
            throw new Error(
                error.error || `Failed to fetch inspection images: ${response.statusText}`
            );
        }

        const data = await response.json();
        return validateApiResponse(
            InspectionImageResponseSchema,
            data,
            'InspectionImageResponse'
        );
    },

    getSingleImageUrl(mcId: number, ngPath: string): string {
        return `${API_BASE}/LogAnalyzer/fetch-image/${mcId}?path=${encodeURIComponent(ngPath)}`;
    },
};

export default logAnalyzerService;
