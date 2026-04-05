
import type { ScanResult, RegisterPackageRequest } from '../types/updateTypes';

const BUNDLE_BASE = '/api/Bundle';
const LAI_BASE = '/api/LAI';

/**
 * Unified scanning API — both Bundle and LAI use the same scan-then-register pattern
 * from shared network paths. No file uploads.
 */
export const scanApi = {

    async scan(packageType: 'Bundle' | 'LAI', networkPath: string): Promise<ScanResult> {
        const base = packageType === 'Bundle' ? BUNDLE_BASE : LAI_BASE;
        const response = await fetch(`${base}/scan`, {
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

    async register(packageType: 'Bundle' | 'LAI', request: RegisterPackageRequest): Promise<{
        success: boolean;
        packageId?: number;
        errorMessage?: string;
    }> {
        const base = packageType === 'Bundle' ? BUNDLE_BASE : LAI_BASE;
        const response = await fetch(`${base}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || data.message || `Register failed: ${response.statusText}`);
        }
        return data;
    },
};
