import type { LogFileStructure, LogFileContent, InspectionImageRequest, InspectionImageResponse } from '../types/logTypes';

const API_BASE = '/api';

export const logAnalyzerApi = {
    async getLogStructure(mcId: number): Promise<LogFileStructure> {
        const response = await fetch(`${API_BASE}/LogAnalyzer/structure/${mcId}`);
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(error.error || `Failed to fetch log structure: ${response.statusText}`);
        }
        return response.json();
    },

    async getLogFileContent(mcId: number, filePath: string): Promise<LogFileContent> {
        const response = await fetch(`${API_BASE}/LogAnalyzer/file/${mcId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath })
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(error.error || `Failed to fetch log file: ${response.statusText}`);
        }
        return response.json();
    },

    async downloadLogFile(mcId: number, filePath: string): Promise<Blob> {
        const response = await fetch(`${API_BASE}/LogAnalyzer/download/${mcId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath })
        });
        if (!response.ok) {
            throw new Error(`Failed to download log file: ${response.statusText}`);
        }
        return response.blob();
    },

    
    async getInspectionImages(
        mcId: number,
        request: InspectionImageRequest
    ): Promise<InspectionImageResponse> {
        const response = await fetch(`${API_BASE}/LogAnalyzer/images/${mcId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(error.error || `Failed to fetch inspection images: ${response.statusText}`);
        }

        const data: InspectionImageResponse = await response.json();

        
        return data;
    },

    
    getSingleImageUrl(mcId: number, imagePath: string): string {
        return `${API_BASE}/LogAnalyzer/fetch-image/${mcId}?path=${encodeURIComponent(imagePath)}`;
    }
};