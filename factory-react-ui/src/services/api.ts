
import axios from 'axios'
import type {
    MCDetails,
    ModelFile,
    Stats,
    ApplyModelRequest,
    LineModelOption,
    PCUpdateRequest,
    PCListResponse,
    ZipEntry
} from '../types'


export const api = axios.create({
    baseURL: '/api',
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 10000,
})

api.interceptors.response.use(
    response => response,
    error => {
        if (error.code === 'ECONNABORTED') {
            throw new Error('Request timeout - backend server may be slow or not responding')
        }
        if (error.code === 'ERR_NETWORK' || !error.response) {
            throw new Error('Cannot connect to backend server. Please ensure backend is running.')
        }
        if (error.response) {
            // --- VALIDATION ERROR HANDLING ---
            const data = error.response.data;
            if (data) {
                if (data.error) {
                    throw new Error(data.error);
                }
                if (data.message) {
                    throw new Error(data.message);
                }
                if (data.errors) {
                    const messages = Object.values(data.errors).flat();
                    // @ts-ignore
                    throw new Error(messages.join(', '));
                }
            }
            // ---------------------------------
            throw new Error(`Server error: ${error.response.status} - ${error.response.statusText}`)
        }
        throw error
    }
)

export const factoryApi = {

    getVersions: async (): Promise<string[]> => {
        const { data } = await api.get('/Api/versions')
        return data
    },

    getLines: async (): Promise<number[]> => {
        const { data } = await api.get('/Api/lines')
        return data
    },

    getPCs: async (version?: string, line?: number): Promise<PCListResponse> => {
        const params = new URLSearchParams()
        if (version) params.append('version', version)
        if (line) params.append('line', line.toString())
        const { data } = await api.get<PCListResponse>(`/Api/pcs?${params}`)
        return data
    },

    getPC: async (id: number): Promise<MCDetails> => {
        const { data } = await api.get(`/Api/pc/${id}`)
        return data
    },

    getStats: async (): Promise<Stats> => {
        const { data } = await api.get('/Api/stats')
        return data
    },

    getLibraryModels: async (): Promise<ModelFile[]> => {
        const { data } = await api.get('/ModelLibrary')
        return data
    },

    uploadModelToLibrary: async (file: File, modelName: string, description?: string, category?: string) => {
        const formData = new FormData()
        formData.append('file', file)
        formData.append('modelName', modelName)
        if (description) formData.append('description', description)
        if (category) formData.append('category', category)

        const { data } = await api.post('/ModelLibrary/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        return data
    },

    applyModel: async (request: ApplyModelRequest) => {
        const { data } = await api.post('/ModelLibrary/apply', request)
        return data
    },

    deleteModel: async (id: number) => {
        const { data } = await api.post(`/ModelLibrary/delete/${id}`)
        return data
    },

    changeModel: async (mcId: number, modelName: string) => {
        const formData = new URLSearchParams()
        formData.append('mcId', mcId.toString())
        formData.append('modelName', modelName)

        const { data } = await api.post('/MC/ChangeModel', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
        return data
    },

    downloadConfig: async (mcId: number) => {
        const response = await api.get(`/MC/DownloadConfig?mcId=${mcId}`, { responseType: 'blob' })
        return response.data
    },

    downloadModelTemplate: async (modelFileId: number) => {
        const response = await api.get(`/ModelLibrary/download/${modelFileId}`, {
            responseType: 'blob',
            timeout: 0 // Disable timeout for downloads
        })
        return response.data
    },

    getLineAvailableModels: async (lineNumber: number, version?: string): Promise<LineModelOption[]> => {
        const params = new URLSearchParams()
        if (version) params.append('version', version)

        const { data } = await api.get(`/ModelLibrary/line-available/${lineNumber}?${params}`)
        return data
    },

    deleteLineModel: async (lineNumber: number, modelName: string) => {
        const { data } = await api.post('/ModelLibrary/line-delete', { lineNumber, modelName })
        return data
    },

    uploadModelToPC: async (mcId: number, file: File) => {
        const formData = new FormData()
        formData.append('modelFile', file)
        formData.append('mcId', mcId.toString())

        const { data } = await api.post('/MC/UploadModel', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        return data
    },

    downloadModelFromPC: async (mcId: number, modelName: string) => {
        const formData = new URLSearchParams()
        formData.append('mcId', mcId.toString())
        formData.append('modelName', modelName)

        const { data } = await api.post('/MC/DownloadModel', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
        return data
    },

    deleteModelFromPC: async (mcId: number, modelName: string) => {
        const formData = new URLSearchParams()
        formData.append('mcId', mcId.toString())
        formData.append('modelName', modelName)

        const { data } = await api.post('/MC/DeleteModel', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
        return data
    },

    uploadConfig: async (mcId: number, file: File) => {
        const formData = new FormData()
        formData.append('configFile', file)
        formData.append('mcId', mcId.toString())

        const { data } = await api.post('/MC/UpdateConfig', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        return data
    },

    requestDownloadFromPC: async (mcId: number, modelName: string) => {
        const { data } = await api.post('/ModelLibrary/request-download', { mcId, modelName })
        return data
    },

    checkDownloadStatus: async (requestId: string) => {
        const { data } = await api.get(`/ModelLibrary/check-status/${requestId}`)
        return data
    },

    getDownloadUrl: (requestId: string) => `/api/ModelLibrary/serve-download/${requestId}`,

    deletePC: async (mcId: number) => {
        const { data } = await api.post('/MC/DeleteMC', null, { params: { mcId } })
        return data
    },

    updatePC: async (data: PCUpdateRequest) => {
        const { data: res } = await api.post('/MC/UpdateMC', data)
        return res
    },

    getModelStructure: async (id: number): Promise<ZipEntry[]> => {
        const { data } = await api.get(`/ModelLibrary/${id}/structure`)
        return data
    },

    getModelFileContent: async (id: number, path: string): Promise<{ content: string }> => {
        // Encode path to handle slashes correctly
        const encodedPath = encodeURIComponent(path)
        const { data } = await api.get(`/ModelLibrary/${id}/file-content?path=${encodedPath}`)
        return data
    },

    // ...
    saveModelFileContent: async (id: number, path: string, content: string) => {
        const { data } = await api.post(`/ModelLibrary/${id}/save-file`, { path, content })
        return data
    },

    saveModelFiles: async (id: number, updates: { path: string, content: string }[]) => {
        const { data } = await api.post(`/ModelLibrary/${id}/save-files`, { updates })
        return data
    },
    getModelHistory: async (id: number) => {
        const { data } = await api.get(`/ModelLibrary/${id}/history`)
        return data
    },

    getModelVersions: async (id: number): Promise<any[]> => {
        const { data } = await api.get(`/ModelLibrary/${id}/versions`)
        return data
    },

    revertModelVersion: async (id: number, versionId: number) => {
        const { data } = await api.post(`/ModelLibrary/${id}/revert/${versionId}`)
        return data
    },

    requestSync: async (mcId: number): Promise<{ message: string }> => {
        const { data } = await api.post(`/MC/RequestSync?mcId=${mcId}`)
        return data
    },

    requestLineSync: async (lineNumber: number, version?: string): Promise<{ message: string; count: number }> => {
        const params = new URLSearchParams()
        params.append('lineNumber', lineNumber.toString())
        if (version) params.append('version', version)
        const { data } = await api.post(`/MC/RequestLineSync?${params}`)
        return data
    },
}