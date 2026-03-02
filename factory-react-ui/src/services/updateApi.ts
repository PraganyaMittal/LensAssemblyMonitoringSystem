// API service for Update Management
// Feature 1: Package Library

import type { PackageListResponse } from '../types/updateTypes';

const API_BASE = '/api/Updates';

export const updateApi = {
    /**
     * List active packages with optional filters.
     */
    async getPackages(
        type?: string,
        search?: string,
        page: number = 1,
        pageSize: number = 20
    ): Promise<PackageListResponse> {
        const params = new URLSearchParams();
        if (type) params.append('type', type);
        if (search) params.append('search', search);
        params.append('page', page.toString());
        params.append('pageSize', pageSize.toString());

        const response = await fetch(`${API_BASE}/packages?${params}`);
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || `Failed to fetch packages: ${response.statusText}`);
        }
        return response.json();
    },

    /**
     * Upload a new .zip package.
     */
    async uploadPackage(formData: FormData): Promise<{ success: boolean; packageId?: number; message?: string }> {
        const response = await fetch(`${API_BASE}/packages/upload`, {
            method: 'POST',
            body: formData, // Do not set Content-Type — browser sets multipart boundary automatically
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || `Upload failed: ${response.statusText}`);
        }
        return data;
    },

    /**
     * Soft-delete a package.
     */
    async deletePackage(id: number): Promise<void> {
        const response = await fetch(`${API_BASE}/packages/${id}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || `Delete failed: ${response.statusText}`);
        }
    },

    /**
     * Get the download URL for a package.
     */
    getDownloadUrl(id: number): string {
        return `${API_BASE}/packages/${id}/download`;
    }
};
