


import type { PackageListResponse, ScheduleListResponse, ScheduleDetailResponse, CreateScheduleRequest, MCTarget } from '../types/updateTypes';

const API_BASE = '/api/Updates';

export const updateApi = {
    
    
    

    
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

    
    async uploadPackage(formData: FormData): Promise<{ success: boolean; packageId?: number; message?: string }> {
        const response = await fetch(`${API_BASE}/packages/upload`, {
            method: 'POST',
            body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || `Upload failed: ${response.statusText}`);
        }
        return data;
    },

    
    async deletePackage(id: number): Promise<void> {
        const response = await fetch(`${API_BASE}/packages/${id}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || `Delete failed: ${response.statusText}`);
        }
    },

    
    getDownloadUrl(id: number): string {
        return `${API_BASE}/packages/${id}/download`;
    },

    
    
    

    
    async createSchedule(request: CreateScheduleRequest): Promise<{ success: boolean; scheduleId?: number; targetCount?: number; message?: string }> {
        const response = await fetch(`${API_BASE}/schedules`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || `Create schedule failed: ${response.statusText}`);
        }
        return data;
    },

    
    async getSchedules(
        status?: string,
        page: number = 1,
        pageSize: number = 20
    ): Promise<ScheduleListResponse> {
        const params = new URLSearchParams();
        if (status) params.append('status', status);
        params.append('page', page.toString());
        params.append('pageSize', pageSize.toString());

        const response = await fetch(`${API_BASE}/schedules?${params}`);
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || `Failed to fetch schedules: ${response.statusText}`);
        }
        return response.json();
    },

    
    async getScheduleDetail(id: number): Promise<ScheduleDetailResponse> {
        const response = await fetch(`${API_BASE}/schedules/${id}`);
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || `Failed to fetch schedule detail: ${response.statusText}`);
        }
        return response.json();
    },

    
    async cancelSchedule(id: number): Promise<{ success: boolean; cancelledCount?: number; message?: string }> {
        const response = await fetch(`${API_BASE}/schedules/${id}/cancel`, {
            method: 'POST',
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || `Cancel failed: ${response.statusText}`);
        }
        return data;
    },

    
    async getAvailableTargets(): Promise<MCTarget[]> {
        const response = await fetch(`${API_BASE}/available-targets`);
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || `Failed to fetch targets: ${response.statusText}`);
        }
        return response.json();
    },

    
    
    

    async getArchivedPackages(): Promise<{ packages: any[], retentionDays: number }> {
        const response = await fetch(`${API_BASE}/packages/archived`);
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || `Failed to fetch archived packages: ${response.statusText}`);
        }
        return response.json();
    },

    async restorePackage(id: number): Promise<{ success: boolean; message?: string }> {
        const response = await fetch(`${API_BASE}/packages/${id}/restore`, { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Restore failed');
        return data;
    },

    async purgePackage(id: number): Promise<{ success: boolean; message?: string }> {
        const response = await fetch(`${API_BASE}/packages/${id}/purge`, { method: 'DELETE' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Purge failed');
        return data;
    },

    async getSettings(): Promise<any[]> {
        const response = await fetch(`${API_BASE}/settings`);
        if (!response.ok) {
            const error = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(error.message || `Failed to fetch settings: ${response.statusText}`);
        }
        return response.json();
    },

    async updateSetting(key: string, value: string, description?: string): Promise<{ success: boolean; message?: string }> {
        const response = await fetch(`${API_BASE}/settings/${key}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value, description }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Update setting failed');
        return data;
    },

    
    
    

    async rollbackSchedule(id: number): Promise<{ success: boolean; rollbackScheduleId?: number; targetCount?: number; message?: string }> {
        const response = await fetch(`${API_BASE}/schedules/${id}/rollback`, { method: 'POST' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Rollback failed');
        return data;
    },

    
    
};
