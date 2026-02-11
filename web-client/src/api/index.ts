import axios from 'axios'

// Use relative path for Docker/Proxy compatibility
// If VITE_API_URL is set (at build time), use it. Otherwise default to /api
const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
})

// Add token to requests
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token')
    if (token) {
        config.headers.Authorization = `Bearer ${token}`
    }
    return config
})

export interface AuthResponse {
    token: string
    user_id: string
    name: string
}

export const authApi = {
    register: (data: Record<string, any>) => api.post<AuthResponse>('/auth/register', data),
    login: (data: Record<string, any>) => api.post<AuthResponse>('/auth/login', data),
}

export const messageApi = {
    // Backend expects MessagePayload: { encrypted_blob, nonce, sender_id, group_id, recipient_id }
    // For now, we put the content in encrypted_blob as plaintext
    sendMessage: (gid: string, content: string, senderId: string) => api.post(`/messages/group/${gid}`, {
        encrypted_blob: content, // Temporary: sending plaintext until E2EE
        nonce: "test-nonce",     // Temporary
        sender_id: senderId,
        group_id: gid,
        recipient_id: null
    }),
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
    }
    timestamp: number
}

export const subscribeToEvents = (onMessage: (msg: MessageEventData) => void) => {
    const token = localStorage.getItem('token')
    // Use relative path if API_BASE_URL is /api, otherwise full URL
    const url = API_BASE_URL.startsWith('http')
        ? `${API_BASE_URL}/messages/events?token=${token}`
        : `${window.location.origin}${API_BASE_URL}/messages/events?token=${token}`

    console.log("Connecting to SSE:", url)
    const eventSource = new EventSource(url)

    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data)
            onMessage(data)
        } catch (e) {
            console.error("Failed to parse event data", e)
        }
    }

    eventSource.onerror = (err) => {
        console.error("SSE Error:", err)
    }

    return () => eventSource.close()
}
