
import {
    LogFileStructure,
    LogFileContent,
    InspectionImageRequest,
    InspectionImageResponse,
    LogFileStructureSchema,
    LogFileContentSchema,
    InspectionImageResponseSchema,
    validateApiResponse,
} from '../types/log.schemas';

const API_BASE = '/api';

export const logAnalyzerService = {
    
    async getLogStructure(
        mcId: number,
        signal?: AbortSignal
    ): Promise<LogFileStructure> {
        const response = await fetch(
            `${API_BASE}/LogAnalyzer/structure/${mcId}`,
            { signal }
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({
                error: response.statusText
            }));
            throw new Error(
                error.error || `Failed to fetch log structure: ${response.statusText}`
            );
        }

        const data = await response.json();
        return validateApiResponse(LogFileStructureSchema, data, 'LogFileStructure');
    },

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

    async downloadLogFile(
        mcId: number,
        filePath: string,
        signal?: AbortSignal
    ): Promise<Blob> {
        const response = await fetch(`${API_BASE}/LogAnalyzer/download/${mcId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath }),
            signal,
        });

        if (!response.ok) {
            throw new Error(`Failed to download log file: ${response.statusText}`);
        }

        return response.blob();
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

    getSingleImageUrl(mcId: number, imagePath: string): string {
        return `${API_BASE}/LogAnalyzer/fetch-image/${mcId}?path=${encodeURIComponent(imagePath)}`;
    },
};

export default logAnalyzerService;
