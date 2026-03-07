import axios from 'axios'

const API_BASE_URL = import.meta.env?.VITE_API_URL || '/api'

export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
})

import type { InternalAxiosRequestConfig } from 'axios'
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('token')
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
})

export interface AuthResponse {
    token: string
    user_id: string
    name: string
    e2ee_initialized: boolean
    is_admin: boolean
}

export interface StoredMessage {
    id: string
    timestamp: number
    payload: {
        encrypted_blob: string
        nonce: string
        sender_id: string
        group_id: string | null
        recipient_id: string | null
        recipient_keys: Record<string, string>
    }
}

export const authApi = {
    register: (data: Record<string, unknown>) => api.post<AuthResponse>('/auth/register', data),
    login: (data: Record<string, unknown>) => api.post<AuthResponse>('/auth/login', data),
}

export const messageApi = {
    sendGroupMessage: (
        gid: string,
        content: string,
        senderId: string,
        recipientKeys: Record<string, string>,
        nonce: string
    ) => api.post(`/messages/group/${gid}`, {
        encrypted_blob: content,
        nonce,
        sender_id: senderId,
        group_id: gid,
        recipient_id: null,
        recipient_keys: recipientKeys,
    }),

    sendDM: (
        targetUid: string,
        content: string,
        senderId: string,
        recipientKeys: Record<string, string>,
        nonce: string
    ) => api.post(`/messages/dm/${targetUid}`, {
        encrypted_blob: content,
        nonce,
        sender_id: senderId,
        group_id: null,
        recipient_id: targetUid,
        recipient_keys: recipientKeys,
    }),

    getGroupHistory: (gid: string, limit = 50) =>
        api.get<StoredMessage[]>(`/messages/group/${gid}/history`, { params: { limit } }),

    getDMHistory: (uid: string, limit = 50) =>
        api.get<StoredMessage[]>(`/messages/dm/${uid}/history`, { params: { limit } }),

    deleteMessage: (mid: string) => api.delete(`/messages/${mid}`),
}

export const usersApi = {
    getAllUsers: () => api.get<Array<{ user_id: string; name: string; email?: string; public_key: string | null; is_admin?: boolean }>>('/users'),
    searchUsers: (q: string) => api.get<Array<{ user_id: string; name: string; email?: string; public_key: string | null }>>('/users/search', { params: { q } }),
}

export const keyApi = {
    uploadKeys: (publicKey: string) => api.post('/users/keys', { public_key: publicKey }),
    getKeys: (userId: string) => api.get(`/users/${userId}/keys`),
}

export interface MessageEventData {
    event_type: string
    payload: {
        encrypted_blob: string
        nonce: string
        sender_id: string
        group_id: string | null
        recipient_id: string | null
        recipient_keys: Record<string, string>
    }
    timestamp: number
}

export const subscribeToEvents = (onMessage: (msg: MessageEventData) => void) => {
    const token = localStorage.getItem('token')
    const url = API_BASE_URL.startsWith('http')
        ? `${API_BASE_URL}/messages/events?token=${token}`
        : `${window.location.origin}${API_BASE_URL}/messages/events?token=${token}`

    const eventSource = new EventSource(url)

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data)
            onMessage(data)
        } catch (e) {
            console.error('Failed to parse event data', e)
        }
    }

    eventSource.onerror = (err) => console.error('SSE Error:', err)

    return () => eventSource.close()
}
