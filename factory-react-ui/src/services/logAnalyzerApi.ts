import type { LogFileStructure, LogFileContent, InspectionImageRequest, InspectionImageResponse } from '../types/logTypes';
import pako from 'pako';

const API_BASE = '/api';

// Helper to decompress GZIP data (agent sends compressed BMP)
async function decompressGzip(compressedBase64: string): Promise<string> {
    try {
        // Decode base64 to binary
        const binaryString = atob(compressedBase64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        // Decompress using pako
        const decompressed = pako.inflate(bytes);

        // Convert back to base64 for image display
        let binary = '';
        for (let i = 0; i < decompressed.length; i++) {
            binary += String.fromCharCode(decompressed[i]);
        }
        return btoa(binary);
    } catch (error) {
        console.error('Failed to decompress image:', error);
        // Return original if decompression fails (might not be compressed)
        return compressedBase64;
    }
}

export const logAnalyzerApi = {
    async getLogStructure(pcId: number): Promise<LogFileStructure> {
        const response = await fetch(`${API_BASE}/LogAnalyzer/structure/${pcId}`);
        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(error.error || `Failed to fetch log structure: ${response.statusText}`);
        }
        return response.json();
    },

    async getLogFileContent(pcId: number, filePath: string): Promise<LogFileContent> {
        const response = await fetch(`${API_BASE}/LogAnalyzer/file/${pcId}`, {
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

    async downloadLogFile(pcId: number, filePath: string): Promise<Blob> {
        const response = await fetch(`${API_BASE}/LogAnalyzer/download/${pcId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filePath })
        });
        if (!response.ok) {
            throw new Error(`Failed to download log file: ${response.statusText}`);
        }
        return response.blob();
    },

    /**
     * Fetch inspection images for an NG operation.
     * Images are sent as raw Base64 (NO COMPRESSION for testing).
     */
    async getInspectionImages(
        pcId: number,
        request: InspectionImageRequest
    ): Promise<InspectionImageResponse> {
        const response = await fetch(`${API_BASE}/LogAnalyzer/images/${pcId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request)
        });

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: response.statusText }));
            throw new Error(error.error || `Failed to fetch inspection images: ${response.statusText}`);
        }

        const data: InspectionImageResponse = await response.json();

        // NO DECOMPRESSION - images are sent as raw Base64 for testing
        return data;
    }
};