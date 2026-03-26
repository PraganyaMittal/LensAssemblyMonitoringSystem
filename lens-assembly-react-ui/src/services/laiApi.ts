

import type { LAIScanResult, LAIRegisterRequest } from '../types/updateTypes';

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
        packageId?: number;
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
};
