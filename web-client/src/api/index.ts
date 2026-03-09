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

export interface ForwardInfo {
    original_message_id: string
    original_sender_id: string
    original_sender_name: string
    original_timestamp: number
}

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
        reply_to?: string | null
        reply_to_preview?: string | null
        mentions?: string[]
        content_type?: string | null
        forward_info?: ForwardInfo
    }
    reply_to?: string | null
    reply_to_preview?: string | null
}

export interface PinnedMessage {
    id: string
    channel_id: string | null
    pinned_by: string
    content: string
    pinned_at: string
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
        nonce: string,
        replyTo?: string,
        mentions?: string[]
    ) => api.post(`/messages/group/${gid}`, {
        encrypted_blob: content,
        nonce,
        sender_id: senderId,
        group_id: gid,
        recipient_id: null,
        recipient_keys: recipientKeys,
        reply_to: replyTo ?? null,
        mentions: mentions && mentions.length > 0 ? mentions : null,
        content_type: 'text',
    }),

    sendDM: (
        targetUid: string,
        content: string,
        senderId: string,
        recipientKeys: Record<string, string>,
        nonce: string,
        replyTo?: string,
        mentions?: string[]
    ) => api.post(`/messages/dm/${targetUid}`, {
        encrypted_blob: content,
        nonce,
        sender_id: senderId,
        group_id: null,
        recipient_id: targetUid,
        recipient_keys: recipientKeys,
        reply_to: replyTo ?? null,
        mentions: mentions && mentions.length > 0 ? mentions : null,
        content_type: 'text',
    }),

    getGroupHistory: (gid: string, limit = 50) =>
        api.get<StoredMessage[]>(`/messages/group/${gid}/history`, { params: { limit } }),

    getDMHistory: (uid: string, limit = 50) =>
        api.get<StoredMessage[]>(`/messages/dm/${uid}/history`, { params: { limit } }),

    deleteMessage: (mid: string) => api.delete(`/messages/${mid}`),

    editMessage: (mid: string, payload: {
        encrypted_blob: string
        nonce: string
        sender_id: string
        group_id: string | null
        recipient_id: string | null
        recipient_keys: Record<string, string>
    }) => api.put(`/messages/${mid}/edit`, payload),

    markRead: (messageId: string) => api.post(`/messages/${messageId}/read`),

    pinMessage: (messageId: string, channelId: string | null, content: string) =>
        api.post('/messages/pin', { message_id: messageId, channel_id: channelId, content }),

    unpinMessage: (messageId: string) => api.delete(`/messages/pin/${messageId}`),

    getPinnedMessages: (channelId: string) =>
        api.get<PinnedMessage[]>(`/messages/pin/channel/${channelId}`),

    forwardMessage: (messageIds: string[], targetType: string, targetId: string) =>
        api.post<string[]>('/messages/forward', {
            message_ids: messageIds,
            target_type: targetType,
            target_id: targetId,
        }),

    forwardCombined: (messageIds: string[], targetType: string, targetId: string) =>
        api.post<string>('/messages/forward_combined', {
            message_ids: messageIds,
            target_type: targetType,
            target_id: targetId,
        }),

    searchMessages: (q: string, channelId?: string, limit = 30) =>
        api.get<StoredMessage[]>('/messages/search', { params: { q, channel_id: channelId, limit } }),

    getMessageContext: (messageId: string) =>
        api.get<StoredMessage>(`/messages/context/${messageId}`),
}


export const reactionApi = {
    addReaction: (messageId: string, emoji: string) =>
        api.post(`/messages/${messageId}/reaction`, { emoji }),
    removeReaction: (messageId: string, emoji: string) =>
        api.delete(`/messages/${messageId}/reaction`, { data: { emoji } }),
}

export const usersApi = {
    getAllUsers: () => api.get<Array<{ user_id: string; name: string; email?: string; public_key: string | null; is_admin?: boolean }>>('/users'),
    searchUsers: (q: string) => api.get<Array<{ user_id: string; name: string; email?: string; public_key: string | null }>>('/users/search', { params: { q } }),
    updateMe: (data: { name?: string }) => api.put('/users/me', data),
    changePassword: (data: { old_password: string; new_password: string }) => api.put('/users/me/password', data),
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
        reply_to?: string | null
        reply_to_preview?: string | null
        mentions?: string[]
        content_type?: string | null
        forward_info?: ForwardInfo
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
