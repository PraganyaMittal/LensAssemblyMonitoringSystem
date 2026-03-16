// API service for LAI release management
// Scans metadata from shared path, registers releases to Software Library

import type { LAIScanResult, LAIRegisterRequest } from '../types/updateTypes';

const API_BASE = '/api/LAI';

export const laiApi = {

    /**
     * Scan a shared network path for LAI release metadata.
     * Server reads release-info.json from the path — no binary copy.
     */
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

    /**
     * Register a scanned release to the Software Library.
     * Server stores metadata as UpdatePackage — deploy happens from line-level modal.
     */
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
