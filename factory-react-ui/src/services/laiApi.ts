


import type { LAIScanResult, LAIRegisterRequest, LAIRelease } from '../types/updateTypes';

const API_BASE = '/api/LAI';

export const laiApi = {

    
    async scanRelease(networkPath: string): Promise<LAIScanResult> {
        const response = await fetch(`${API_BASE}/scan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ networkPath }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `Scan failed: ${response.statusText}`);
        }
        return data;
    },

    
    async registerAndDeploy(request: LAIRegisterRequest): Promise<{
        success: boolean;
        laiReleaseId?: number;
        targetMCCount?: number;
        errorMessage?: string;
    }> {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `Register failed: ${response.statusText}`);
        }
        return data;
    },

    
    async getReleasesForLine(lineNumber: number): Promise<LAIRelease[]> {
        const response = await fetch(`${API_BASE}/releases?lineNumber=${lineNumber}`);
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.error || `Failed to fetch releases: ${response.statusText}`);
        }
        return response.json();
    },
};
