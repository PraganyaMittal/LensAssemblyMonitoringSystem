import axios from 'axios';

// Update with your actual API base URL
const API_BASE_URL = '/api';

export interface RequestEditResponse {
    sessionId: string;
    uploadUrl: string;
}

export interface SessionStatusResponse {
    status: string;
    files: string[];
}

export interface SaveFileRequest {
    content: string;
}

export const localModelApi = {
    requestEdit: async (mcId: number, modelName: string): Promise<RequestEditResponse> => {
        const response = await axios.post<RequestEditResponse>(`${API_BASE_URL}/localmodel/request-edit`, {
            mcId,
            modelName,
        });
        return response.data;
    },

    getSessionStatus: async (sessionId: string): Promise<SessionStatusResponse> => {
        const response = await axios.get<SessionStatusResponse>(`${API_BASE_URL}/localmodel/session/${sessionId}/status`);
        return response.data;
    },

    getFileContent: async (sessionId: string, path: string): Promise<string> => {
        const response = await axios.get<{ content: string }>(`${API_BASE_URL}/localmodel/session/${sessionId}/file`, {
            params: { path },
        });
        return response.data.content;
    },

    saveFileContent: async (sessionId: string, path: string, content: string): Promise<void> => {
        await axios.post(`${API_BASE_URL}/localmodel/session/${sessionId}/file?path=${encodeURIComponent(path)}`, {
            content,
        });
    },
};
