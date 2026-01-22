import { ZipEntry } from '../types';
import axios from 'axios'
import type {
    PCDetails,
    ModelFile,
    Stats,
    ApplyModelRequest,
    LineModelOption,
    PCUpdateRequest,
    PCListResponse
} from '../types'

const api = axios.create({
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
            if (error.response.status === 400) {
                // Case 1: ASP.NET Core ValidationProblemDetails (standard)
                if (error.response.data && error.response.data.errors) {
                    const messages = Object.values(error.response.data.errors).flat();
                    throw new Error(messages.join(', '));
                }
                // Case 2: Custom ApiResponse with Success=false
                if (error.response.data && error.response.data.message) {
                    throw new Error(error.response.data.message);
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

    getPC: async (id: number): Promise<PCDetails> => {
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
        const { data } = await api.delete(`/ModelLibrary/${id}`)
        return data
    },

    changeModel: async (pcId: number, modelName: string) => {
        const formData = new URLSearchParams()
        formData.append('pcId', pcId.toString())
        formData.append('modelName', modelName)

        const { data } = await api.post('/PC/ChangeModel', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
        return data
    },

    downloadConfig: async (pcId: number) => {
        const response = await api.get(`/Pc/downloadconfig?pcId=${pcId}`, { responseType: 'blob' })
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

    uploadModelToPC: async (pcId: number, file: File) => {
        const formData = new FormData()
        formData.append('modelFile', file)
        formData.append('pcId', pcId.toString())

        const { data } = await api.post('/Model/UploadModel', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        return data
    },

    downloadModelFromPC: async (pcId: number, modelName: string) => {
        const formData = new URLSearchParams()
        formData.append('pcId', pcId.toString())
        formData.append('modelName', modelName)

        const { data } = await api.post('/PC/DownloadModel', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
        return data
    },

    deleteModelFromPC: async (pcId: number, modelName: string) => {
        const formData = new URLSearchParams()
        formData.append('pcId', pcId.toString())
        formData.append('modelName', modelName)

        const { data } = await api.post('/PC/DeleteModel', formData, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        })
        return data
    },

    uploadConfig: async (pcId: number, file: File) => {
        const formData = new FormData()
        formData.append('configFile', file)
        formData.append('pcId', pcId.toString())

        const { data } = await api.post('/PC/UploadConfig', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
        })
        return data
    },

    requestDownloadFromPC: async (pcId: number, modelName: string) => {
        const { data } = await api.post('/ModelLibrary/request-download', { pcId, modelName })
        return data
    },

    checkDownloadStatus: async (requestId: string) => {
        const { data } = await api.get(`/ModelLibrary/check-status/${requestId}`)
        return data
    },

    getDownloadUrl: (requestId: string) => `/api/ModelLibrary/serve-download/${requestId}`,

    deletePC: async (pcId: number) => {
        const { data } = await api.post('/PC/DeletePC', null, { params: { pcId } })
        return data
    },

    updatePC: async (data: PCUpdateRequest) => {
        const { data: res } = await api.post('/PC/UpdatePC', data)
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

}