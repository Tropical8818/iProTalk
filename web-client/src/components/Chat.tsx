import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import {
    Send,
    Hash,
    Paperclip,
    Smile,
    MessageSquare,
    Pin,
    Search,
    KeyRound,
    Settings,
    Check,
    X,
    Forward,
    Reply,
    Users,
    Plus,
    Trash2,
    Edit3,
    Shield
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useSelector } from 'react-redux'
import { useNavigate } from 'react-router-dom'
import { RootState } from '../store'
import { useUploadFileChunkMutation, usePrepareFileMutation } from '../store/api/filesApi'
import { useGetChannelsQuery } from '../store/api/channelsApi'
import { useGetVapidKeyQuery, useSubscribeToPushMutation } from '../store/api/pushApi'
import {
    messageApi, usersApi, reactionApi, subscribeToEvents, keyApi, contactsApi,
    type StoredMessage
} from '../api'
import {
    generateKeyPair, exportPrivateKey, exportPublicKey,
    importPrivateKey, importPublicKey, deriveSharedSecret,
    generateSessionKey, encryptMessage, encryptSessionKey,
    decryptSessionKey, decryptMessage
} from '../lib/crypto'
import UserSettingsModal from './UserSettingsModal'
import UserSearchModal from './UserSearchModal'
import EmojiPicker from './EmojiPicker'
import MessageReaction, { type Reaction } from './MessageReaction'
import MessageReply, { type ReplyInfo } from './MessageReply'
import ChannelCreateModal from './ChannelCreateModal'
import { useInView } from '../lib/useInView'
import FileMessage from './FileMessage'
import MessageSearch from './MessageSearch'
import ForwardModal from './ForwardModal'
import ThreadSidebar from './ThreadSidebar'
import ContextMenu from './ContextMenu'
import AnnouncementBanner from './AnnouncementBanner'
import AdminPanel from './AdminPanel'
import {
    requestNotificationPermission, sendDesktopNotification,
    resetTitle, subscribeUserToPush
} from '../lib/notifications'

// ===== 类型 =====
export interface ForwardInfo {
    original_message_id: string
    original_sender_id: string
    original_sender_name: string
    original_timestamp: number
}

export interface Message {
    id: string
    timestamp: number
    sender: string
    senderId: string
    text: string
    time: string
    isMe: boolean
    isDecrypted: boolean
    replyTo?: ReplyInfo
    mentions?: string[]
    forwardInfo?: ForwardInfo
    reactions?: Record<string, string[]>
    readBy?: string[]
}

export type ViewKey = { type: 'channel'; id: string } | { type: 'dm'; uid: string; name: string }

export interface UserInfo { user_id: string; name: string; publicKey: string | null }

// FILE message helper
const FILE_PATTERN = /^\[FILE:(.*?)\]\((.*?)\)$/

// Individual message wrapper to track read state via IntersectionObserver
function MessageReadWrapper({
    msgId,
    isMe,
    onVisible,
    children,
}: {
    msgId: string
    isMe: boolean
    onVisible: (id: string) => void
    children: React.ReactNode
}) {
    const ref = useInView(useCallback(() => { if (!isMe) onVisible(msgId) }, [msgId, isMe, onVisible]))
    return <div ref={ref}>{children}</div>
}

// ===== 主组件 =====
export const Chat = () => {
    const navigate = useNavigate()
    const user = useSelector((state: RootState) => state.auth.user)

    // --- 视图状态 ---
    const [currentView, setCurrentView] = useState<ViewKey>({ type: 'channel', id: 'general' })
    const [messages, setMessages] = useState<Message[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const [historyLoading, setHistoryLoading] = useState(false)
    const [keysStatus, setKeysStatus] = useState<'init' | 'ready' | 'error'>('init')
    const [keysStatusText, setKeysStatusText] = useState('初始化E2EE中...')
    const [showSettings, setShowSettings] = useState(false)
    const [showSearch, setShowSearch] = useState(false)
    const [showAdmin, setShowAdmin] = useState(false)
    const [showMsgSearch, setShowMsgSearch] = useState(false)
    const [showCreateChannel, setShowCreateChannel] = useState(false)
    const [hoveredMsg, setHoveredMsg] = useState<string | null>(null)
    const [, setShowEmojiPicker] = useState(false)

    // --- Edit ---
    const [editingMsgId, setEditingMsgId] = useState<string | null>(null)
    const [editInput, setEditInput] = useState('')

    // --- Mention ---
    const [mentionQuery, setMentionQuery] = useState<string | null>(null)
    const [mentionIndex, setMentionIndex] = useState(0)
    const inputRef = useRef<HTMLTextAreaElement>(null)

    // --- 新增状态 ---
    const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null)
    const [reactions, setReactions] = useState<Map<string, Reaction[]>>(new Map())
    const markedRead = useRef<Set<string>>(new Set())
    const [replyTo, setReplyTo] = useState<ReplyInfo | null>(null)

    // --- Phase 5: Realtime States ---
    const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set())
    const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set())
    const typingTimeouts = useRef<Map<string, number>>(new Map())

    // --- ContextMenu ---
    const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; msgId: string; text: string; isPinned: boolean; isMine: boolean } | null>(null)
    // --- Forward ---
    const [forwardMsgId, setForwardMsgId] = useState<string | null>(null)
    // --- Pinned messages ---
    const [pinnedMsgIds, setPinnedMsgIds] = useState<Set<string>>(new Set())
    // --- Unread count ---
    const [, setUnreadCount] = useState(0)
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null)

    // --- E2EE Cache ---
    const sharedSecretCache = useRef<Map<string, CryptoKey>>(new Map())

    const activeThreadIdRef = useRef<string | null>(null)
    useEffect(() => { activeThreadIdRef.current = activeThreadId }, [activeThreadId])

    const activeThreadMessage = useMemo(() =>
        messages.find(m => m.id === activeThreadId),
        [messages, activeThreadId])

    const repliesToActiveThread = useMemo(() =>
        messages.filter(m => m.replyTo?.id === activeThreadId),
        [messages, activeThreadId])

    const replyCountMap = useMemo(() => {
        const counts: Record<string, number> = {}
        messages.forEach(m => {
            if (m.replyTo?.id) {
                counts[m.replyTo.id] = (counts[m.replyTo.id] || 0) + 1
            }
        })
        return counts
    }, [messages])

    const scrollRef = useRef<HTMLDivElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const [prepareFile] = usePrepareFileMutation()
    const [uploadFileChunk] = useUploadFileChunkMutation()

    const { data: vapidKeyData } = useGetVapidKeyQuery(undefined, { skip: !user })
    const [subscribeToPush] = useSubscribeToPushMutation()

    const { data: remoteChannels = [] } = useGetChannelsQuery(undefined, { skip: keysStatus !== 'ready' })

    // --- 用户目录（公钥+名字） ---
    const [userDirectory, setUserDirectory] = useState<Record<string, UserInfo>>({})
    // --- DM 联系人列表 ---
    const [contacts, setContacts] = useState<Array<{ uid: string; name: string }>>([])
    // --- DM 未读数状态 ---
    const [dmUnreads, setDmUnreads] = useState<Record<string, number>>({})

    // ===== 初始化 E2EE =====
    const initCrypto = useCallback(async () => {
        if (!user) return
        try {
            if (!user.e2ee_initialized) {
                setKeysStatusText('加载用户目录...')
                const res = await usersApi.getAllUsers()
                const dir: Record<string, UserInfo> = {}
                res.data.forEach(u => {
                    dir[u.user_id] = { user_id: u.user_id, name: u.name, publicKey: u.public_key }
                })
                setUserDirectory(dir)
                setKeysStatus('ready')
                setKeysStatusText('普通模式')
                requestNotificationPermission()
                return
            }

            let privKeyB64 = localStorage.getItem(`e2ee_private_key_${user.id}`)
            let pubKeyB64 = localStorage.getItem(`e2ee_public_key_${user.id}`)

            if (!privKeyB64 || !pubKeyB64) {
                setKeysStatusText('正在生成加密密钥...')
                const keyPair = await generateKeyPair()
                privKeyB64 = await exportPrivateKey(keyPair.privateKey)
                pubKeyB64 = await exportPublicKey(keyPair.publicKey)
                localStorage.setItem(`e2ee_private_key_${user.id}`, privKeyB64)
                localStorage.setItem(`e2ee_public_key_${user.id}`, pubKeyB64)
                setKeysStatusText('上传公钥...')
                await keyApi.uploadKeys(pubKeyB64)
            }

            setKeysStatusText('加载用户目录...')
            const res = await usersApi.getAllUsers()
            const dir: Record<string, UserInfo> = {}
            res.data.forEach(u => {
                dir[u.user_id] = { user_id: u.user_id, name: u.name, publicKey: u.public_key }
            })
            setUserDirectory(dir)
            setKeysStatus('ready')
            setKeysStatusText('E2EE 就绪')
            // Request browser notification permission
            requestNotificationPermission()
        } catch (e) {
            console.error(e)
            setKeysStatus('error')
            setKeysStatusText('加密初始化失败')
        }
    }, [user])

    // --- Push Notifications Subscription ---
    useEffect(() => {
        if (keysStatus === 'ready' && vapidKeyData?.public_key) {
            const handlePushSubscription = async () => {
                try {
                    const granted = await requestNotificationPermission();
                    if (granted) {
                        const subscription = await subscribeUserToPush(vapidKeyData.public_key);
                        const subJson = subscription.toJSON();
                        if (subJson.endpoint && subJson.keys?.p256dh && subJson.keys?.auth) {
                            await subscribeToPush({
                                endpoint: subJson.endpoint,
                                p256dh: subJson.keys.p256dh,
                                auth: subJson.keys.auth
                            }).unwrap();
                            console.log('Push subscription synced with backend');
                        }
                    }
                } catch (e) {
                    console.error('Push subscription failed:', e);
                }
            };
            handlePushSubscription();
        }
    }, [keysStatus, vapidKeyData, subscribeToPush]);

    useEffect(() => {
        initCrypto()
    }, [initCrypto])

    // Load contacts from backend on mount and resolve names against directory
    useEffect(() => {
        if (keysStatus !== 'ready' || !user) return
        contactsApi.getContacts()
            .then(res => {
                const loadedContacts = res.data.map(c => {
                    const matchedName = userDirectory[c.target_uid]?.name || c.target_uid.slice(0, 8)
                    return { uid: c.target_uid, name: matchedName }
                })
                setContacts(loadedContacts)
            })
            .catch(err => {
                console.error("Failed to load contacts", err)
            })
    }, [keysStatus, user, userDirectory])

    // ===== 加载历史消息 =====
    const loadHistory = useCallback(async (view: ViewKey) => {
        if (keysStatus !== 'ready' || !user) return
        setHistoryLoading(true)
        setMessages([])
        try {
            let stored: StoredMessage[]
            if (view.type === 'channel') {
                const res = await messageApi.getGroupHistory(view.id)
                stored = res.data
            } else {
                const res = await messageApi.getDMHistory(view.uid)
                stored = res.data
            }

            const privKeyB64 = localStorage.getItem(`e2ee_private_key_${user.id}`)
            const myPrivKey = privKeyB64 ? await importPrivateKey(privKeyB64) : null

            const decryptedMsgs: Message[] = await Promise.all(stored.map(async (storedMsg) => {
                const p = storedMsg.payload
                let text = '[加密消息]'
                let isDecrypted = false

                if (p.nonce === 'plaintext') {
                    text = p.encrypted_blob
                    isDecrypted = true
                } else if (myPrivKey) {
                    try {
                        const encryptedSessionKeyStr = p.recipient_keys?.[user.id]
                        if (encryptedSessionKeyStr) {
                            const senderInfo = userDirectory[p.sender_id]
                            if (senderInfo && senderInfo.publicKey) {
                                let sharedSecret = sharedSecretCache.current.get(p.sender_id)
                                if (!sharedSecret) {
                                    const senderPubKey = await importPublicKey(senderInfo.publicKey)
                                    sharedSecret = await deriveSharedSecret(myPrivKey, senderPubKey)
                                    sharedSecretCache.current.set(p.sender_id, sharedSecret)
                                }
                                const sessionKey = await decryptSessionKey(encryptedSessionKeyStr, sharedSecret)
                                text = await decryptMessage(sessionKey, p.encrypted_blob, p.nonce)
                                isDecrypted = true
                            }
                        }
                    } catch { /* 无法解密此条消息 */ }
                }

                const senderName = userDirectory[p.sender_id]?.name || p.sender_id.slice(0, 8)
                // Build replyTo from structured fields if available
                let replyToInfo: ReplyInfo | undefined
                if (storedMsg.reply_to) {
                    // reply_to_preview is stored as "sender: preview text"
                    const preview = storedMsg.reply_to_preview ?? ''
                    const colonIdx = preview.indexOf(': ')
                    const replySender = colonIdx >= 0 ? preview.slice(0, colonIdx) : ''
                    const replyText = colonIdx >= 0 ? preview.slice(colonIdx + 2) : preview
                    replyToInfo = {
                        id: storedMsg.reply_to,
                        sender: replySender,
                        text: replyText,
                    }
                }
                return {
                    id: storedMsg.id,
                    timestamp: storedMsg.timestamp,
                    sender: p.sender_id === user.id ? '我' : senderName,
                    senderId: p.sender_id,
                    text,
                    time: new Date(storedMsg.timestamp * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
                    isMe: p.sender_id === user.id,
                    isDecrypted,
                    mentions: p.mentions ?? undefined,
                    forwardInfo: p.forward_info,
                    replyTo: replyToInfo,
                }
            }))

            // Build a map for reply context lookup
            const msgById = new Map<string, { sender: string; text: string }>()
            for (const msg of decryptedMsgs) {
                msgById.set(msg.id, { sender: msg.sender, text: msg.text })
            }

            // Populate replyTo for messages that have reply_to
            for (let i = 0; i < decryptedMsgs.length; i++) {
                const replyToId = stored[i].payload.reply_to
                if (replyToId) {
                    const ref = msgById.get(replyToId)
                    if (ref) {
                        decryptedMsgs[i] = {
                            ...decryptedMsgs[i],
                            replyTo: { id: replyToId, sender: ref.sender, text: ref.text },
                        }
                    }
                }
            }

            setMessages(decryptedMsgs)
        } catch (e) {
            console.error('加载历史消息失败', e)
        } finally {
            setHistoryLoading(false)
        }
    }, [keysStatus, user, userDirectory])

    useEffect(() => {
        if (keysStatus === 'ready') loadHistory(currentView)
    }, [keysStatus, currentView]) // eslint-disable-line

    // Reset unread badge on window focus
    useEffect(() => {
        const handleFocus = () => { setUnreadCount(0); resetTitle() }
        window.addEventListener('focus', handleFocus)
        return () => window.removeEventListener('focus', handleFocus)
    }, [])

    // ===== Heartbeat and initial online users =====
    useEffect(() => {
        // Initial online users fetch
        usersApi.getOnlineUsers().then(res => {
            const online = res.data.map(u => u.user_id)
            setOnlineUsers(new Set(online))
        }).catch(err => console.error("Failed to fetch initial online users", err))

        // Heartbeat every 30s
        const interval = setInterval(() => {
            usersApi.heartbeat().catch(() => { })
        }, 30000)

        // Offline on cleanup
        window.addEventListener('beforeunload', () => usersApi.goOffline())

        return () => {
            clearInterval(interval)
            usersApi.goOffline().catch(() => { })
        }
    }, [])

    // ===== 订阅实时消息 =====
    useEffect(() => {
        if (keysStatus !== 'ready' || !user || !user.id) return

        const cleanup = subscribeToEvents(async (msgData) => {
            const p = msgData.payload

            // Handle new message deduplication
            if (msgData.event_type === 'new_message' || msgData.event_type === 'dm_message') {
                if (msgData.message_id) {
                    setMessages(prev => prev.filter(m => m.id !== msgData.message_id))
                }
                // Continue processing to add the new message
            }

            // Handle delete
            if (msgData.event_type === 'delete_message') {
                if (msgData.message_id) {
                    setMessages(prev => prev.filter(m => m.id !== msgData.message_id))
                }
                return
            }

            // Handle pinning
            if (msgData.event_type === 'pin_message') {
                if (msgData.message_id) setPinnedMsgIds(prev => new Set([...prev, msgData.message_id!]))
                return
            }
            if (msgData.event_type === 'unpin_message') {
                if (msgData.message_id) setPinnedMsgIds(prev => { const s = new Set(prev); s.delete(msgData.message_id!); return s })
                return
            }

            // Handle typing indicator
            if (msgData.event_type === 'typing') {
                if (msgData.user_id && msgData.user_id !== user.id) {
                    // Only care if it's in the current view
                    const isRelevant =
                        (currentView.type === 'channel' && msgData.channel_id === currentView.id) ||
                        (currentView.type === 'dm' && msgData.user_id === currentView.uid);

                    if (isRelevant) {
                        if (msgData.is_typing) {
                            setTypingUsers(prev => new Set([...prev, msgData.user_id!]))
                            // Auto-clear typing status after 5s
                            if (typingTimeouts.current.has(msgData.user_id)) {
                                clearTimeout(typingTimeouts.current.get(msgData.user_id))
                            }
                            const t = window.setTimeout(() => {
                                setTypingUsers(prev => { const s = new Set(prev); s.delete(msgData.user_id!); return s })
                                typingTimeouts.current.delete(msgData.user_id!)
                            }, 5000)
                            typingTimeouts.current.set(msgData.user_id, t)
                        } else {
                            setTypingUsers(prev => { const s = new Set(prev); s.delete(msgData.user_id!); return s })
                            if (typingTimeouts.current.has(msgData.user_id)) {
                                clearTimeout(typingTimeouts.current.get(msgData.user_id))
                                typingTimeouts.current.delete(msgData.user_id)
                            }
                        }
                    }
                }
                return
            }

            // Handle presence indicator
            if (msgData.event_type === 'presence') {
                if (msgData.user_id && msgData.user_id !== user.id) {
                    if (msgData.is_online) {
                        setOnlineUsers(prev => new Set([...prev, msgData.user_id!]))
                    } else {
                        setOnlineUsers(prev => { const s = new Set(prev); s.delete(msgData.user_id!); return s })
                    }
                }
                return
            }

            // Handle read receipts
            if (msgData.event_type === 'read_receipt') {
                if (msgData.message_id && msgData.user_id) {
                    setMessages(prev => prev.map(m => {
                        if (m.id === msgData.message_id) {
                            const readBy = m.readBy || []
                            if (!readBy.includes(msgData.user_id!)) {
                                return { ...m, readBy: [...readBy, msgData.user_id!] }
                            }
                        }
                        return m
                    }))
                }
                return
            }

            // Handle reactions
            if (msgData.event_type === 'reaction') {
                if (msgData.message_id && msgData.emoji && msgData.action && msgData.user_id) {
                    reactionApi.getReactions(msgData.message_id!).then(res => {
                        setReactions(current => {
                            const update = new Map(current)
                            const entries = Object.entries(res.data) as [string, string[]][]
                            const parsed = entries.map(([e, uIds]) => ({
                                emoji: e,
                                count: uIds.length,
                                isMine: uIds.includes(user.id)
                            }))
                            update.set(msgData.message_id!, parsed)
                            return update
                        })
                    }).catch(() => { })
                }
                return
            }

            // Handle mention notifications regardless of current view
            if (msgData.event_type === 'mention') {
                if (p?.mentions?.includes(user.id)) {
                    const senderName = p.sender_id ? (userDirectory[p.sender_id]?.name || p.sender_id.slice(0, 8)) : '用户'
                    sendDesktopNotification(`@提及 — ${senderName} `, '你在一条消息中被@提及')
                }
                return
            }

            if (!p) return

            let text = '[加密消息]'
            let isDecrypted = false

            if (p.nonce === 'plaintext') {
                text = p.encrypted_blob
                isDecrypted = true
            } else {
                try {
                    const privKeyB64 = localStorage.getItem(`e2ee_private_key_${user.id}`)
                    if (privKeyB64) {
                        const encKey = p.recipient_keys?.[user.id]
                        if (encKey) {
                            const senderInfo = userDirectory[p.sender_id]
                            if (senderInfo && senderInfo.publicKey) {
                                const myPrivKey = await importPrivateKey(privKeyB64)
                                let shared = sharedSecretCache.current.get(p.sender_id)
                                if (!shared) {
                                    const senderPubKey = await importPublicKey(senderInfo.publicKey)
                                    shared = await deriveSharedSecret(myPrivKey, senderPubKey)
                                    sharedSecretCache.current.set(p.sender_id, shared)
                                }
                                const sessKey = await decryptSessionKey(encKey, shared)
                                text = await decryptMessage(sessKey, p.encrypted_blob, p.nonce)
                                isDecrypted = true
                            }
                        }
                    }
                } catch { /* ignore */ }
            }

            // 判断是否属于当前视图
            const isCurrentChannel = currentView.type === 'channel' && p.group_id === currentView.id
            const isCurrentDM = currentView.type === 'dm' &&
                p.recipient_id !== null &&
                ((p.sender_id === user.id && p.recipient_id === currentView.uid) ||
                    (p.sender_id === currentView.uid && p.recipient_id === user.id))

            if (isCurrentChannel || isCurrentDM) {
                if (msgData.event_type === 'edit_message') {
                    setMessages(prev => prev.map(m => {
                        if (m.id === msgData.message_id) {
                            return { ...m, text, isDecrypted, time: m.time.includes('(已编辑)') ? m.time : m.time + ' (已编辑)' }
                        }
                        return m
                    }))
                    return
                }

                setMessages(prev => {
                    // Look up reply context from existing messages
                    const replyToInfo: ReplyInfo | undefined = p.reply_to
                        ? (() => {
                            const ref = prev.find(m => m.id === p.reply_to)
                            return ref ? { id: p.reply_to, sender: ref.sender, text: ref.text } : undefined
                        })()
                        : undefined

                    const newMsg: Message = {
                        id: msgData.message_id || `${msgData.timestamp} -${Math.random()} `,
                        timestamp: msgData.timestamp,
                        sender: p.sender_id === user.id ? '我' : (userDirectory[p.sender_id]?.name || p.sender_id.slice(0, 8)),
                        senderId: p.sender_id,
                        text,
                        time: new Date(msgData.timestamp * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
                        isMe: p.sender_id === user.id,
                        isDecrypted,
                        replyTo: replyToInfo,
                        mentions: p.mentions ?? undefined,
                        forwardInfo: p.forward_info,
                    }
                    // 去重
                    if (prev.some(m => m.id === newMsg.id)) return prev
                    return [...prev, newMsg]
                })
            } else {
                // Background processing
                if (p.sender_id !== user.id) {
                    const senderName = userDirectory[p.sender_id]?.name || p.sender_id.slice(0, 8)
                    if (p.recipient_id !== null && p.recipient_id === user.id) {
                        // Background DM
                        // 1. Add to contacts if not present
                        setContacts(prev => {
                            if (!prev.some(c => c.uid === p.sender_id)) {
                                return [...prev, { uid: p.sender_id, name: senderName }]
                            }
                            return prev
                        })
                        // 2. Persist contact status to backend
                        contactsApi.updateContactStatus('add', p.sender_id).catch(() => {})
                        // 3. Increment unread count for this sender
                        setDmUnreads(prev => ({
                            ...prev,
                            [p.sender_id]: (prev[p.sender_id] || 0) + 1
                        }))
                        // 4. Trigger background desktop notification and alert
                        sendDesktopNotification(senderName, `[私信] ${text.slice(0, 100)}`)
                    } else if (p.group_id) {
                        // Background group/channel message
                        sendDesktopNotification(`#${p.group_id} - ${senderName}`, text.slice(0, 100))
                    }
                }
            }
        })

        return () => cleanup()
    }, [keysStatus, user, currentView, userDirectory])

    // 自动滚动到底部
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }, [messages])

    // ===== 加密并发送消息 =====
    const encryptAndSend = async (
        text: string,
        view: ViewKey,
        opts?: { replyTo?: string; replyToPreview?: string; mentions?: string[] }
    ) => {
        if (!user) return
        
        let encryptedBlob = text
        let nonce = 'plaintext'
        let recipientKeys: Record<string, string> = {}

        let shouldEncrypt = false
        if (user.e2ee_initialized) {
            if (view.type === 'dm') {
                const recipientInfo = userDirectory[view.uid]
                if (recipientInfo?.publicKey) {
                    shouldEncrypt = true
                }
            } else {
                shouldEncrypt = true
            }
        }

        if (shouldEncrypt) {
            const privKeyB64 = localStorage.getItem(`e2ee_private_key_${user.id}`)
            if (!privKeyB64) throw new Error('缺少私钥')
            const myPrivKey = await importPrivateKey(privKeyB64)
            const sessionKey = await generateSessionKey()
            const enc = await encryptMessage(sessionKey, text)
            encryptedBlob = enc.encryptedBlob
            nonce = enc.nonce

            for (const [uid, uinfo] of Object.entries(userDirectory)) {
                if (!uinfo.publicKey) continue
                try {
                    const pubKey = await importPublicKey(uinfo.publicKey)
                    const shared = await deriveSharedSecret(myPrivKey, pubKey)
                    const { encryptedSessionKey } = await encryptSessionKey(sessionKey, shared)
                    recipientKeys[uid] = encryptedSessionKey
                } catch { /* skip */ }
            }
        }

        if (view.type === 'channel') {
            await messageApi.sendGroupMessage(view.id, encryptedBlob, user.id, recipientKeys, nonce, opts)
        } else {
            await messageApi.sendDM(view.uid, encryptedBlob, user.id, recipientKeys, nonce, opts)
        }
    }

    const editEncryptedMessage = async (msgId: string, newText: string, view: ViewKey) => {
        if (!user) return
        
        let encryptedBlob = newText
        let nonce = 'plaintext'
        let recipientKeys: Record<string, string> = {}

        let shouldEncrypt = false
        if (user.e2ee_initialized) {
            if (view.type === 'dm') {
                const recipientInfo = userDirectory[view.uid]
                if (recipientInfo?.publicKey) {
                    shouldEncrypt = true
                }
            } else {
                shouldEncrypt = true
            }
        }

        if (shouldEncrypt) {
            const privKeyB64 = localStorage.getItem(`e2ee_private_key_${user.id}`)
            if (!privKeyB64) throw new Error('缺少私钥')
            const myPrivKey = await importPrivateKey(privKeyB64)
            const sessionKey = await generateSessionKey()
            const enc = await encryptMessage(sessionKey, newText)
            encryptedBlob = enc.encryptedBlob
            nonce = enc.nonce

            for (const [uid, uinfo] of Object.entries(userDirectory)) {
                if (!uinfo.publicKey) continue
                try {
                    const pubKey = await importPublicKey(uinfo.publicKey)
                    const shared = await deriveSharedSecret(myPrivKey, pubKey)
                    const { encryptedSessionKey } = await encryptSessionKey(sessionKey, shared)
                    recipientKeys[uid] = encryptedSessionKey
                } catch { /* skip */ }
            }
        }

        const payload = {
            encrypted_blob: encryptedBlob,
            nonce,
            sender_id: user.id,
            group_id: view.type === 'channel' ? view.id : null,
            recipient_id: view.type === 'dm' ? view.uid : null,
            recipient_keys: recipientKeys,
        }
        await messageApi.editMessage(msgId, payload)
    }

    const handleSaveEdit = async (msgId: string) => {
        if (!editInput.trim() || !user) return
        try {
            await editEncryptedMessage(editInput.trim(), msgId, currentView)
            setMessages(prev => prev.map(m => m.id === msgId ? { ...m, text: editInput.trim() } : m))
        } catch (e) {
            console.error('编辑失败', e)
            alert('编辑失败')
        } finally {
            setEditingMsgId(null)
            setEditInput('')
        }
    }

    const handleJumpToMessage = (messageId: string) => {
        const el = document.getElementById(`msg - ${messageId} `)
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' })
            el.classList.add('ring-2', 'ring-indigo-500', 'ring-offset-2', 'ring-offset-slate-900')
            setTimeout(() => {
                el.classList.remove('ring-2', 'ring-indigo-500', 'ring-offset-2', 'ring-offset-slate-900')
            }, 2000)
        } else {
            alert('消息不在当前视图中，请向上滚动加载更多历史记录')
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || loading || keysStatus !== 'ready') return
        setLoading(true)
        const textToSend = input.trim()
        // Extract @mentioned user IDs from input (matches @name against userDirectory)
        const mentionedIds: string[] = []
        const mentionRegex = /@([\w\u4e00-\u9fa5]+)/g
        let m
        while ((m = mentionRegex.exec(textToSend)) !== null) {
            const name = m[1]
            const uid = Object.entries(userDirectory).find(([, u]) => u.name === name)?.[0]
            if (uid) mentionedIds.push(uid)
        }
        try {
            await encryptAndSend(textToSend, currentView, {
                replyTo: replyTo?.id,
                replyToPreview: replyTo ? `${replyTo.sender}: ${replyTo.text.slice(0, 80)} ` : undefined,
                mentions: mentionedIds.length > 0 ? mentionedIds : undefined,
            })
            // Minimal optimistic UI or clear input
        } catch (err) {
            console.error('发送消息失败', err)
        } finally {
            setInput('')
            setReplyTo(null)
            setMentionQuery(null)
            setLoading(false)
        }
    }

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file || loading || keysStatus !== 'ready') return
        setLoading(true)
        try {
            const { file_id } = await prepareFile({ content_type: file.type || 'application/octet-stream', filename: file.name }).unwrap()
            const formData = new FormData()
            formData.append('file_id', file_id)
            formData.append('chunk_is_last', 'true')
            formData.append('filename', file.name)
            formData.append('content_type', file.type || 'application/octet-stream')
            formData.append('chunk_data', file)
            const uploadRes = await uploadFileChunk(formData).unwrap()
            const fileMsg = `[FILE:${file.name}](${uploadRes.path})`
            await encryptAndSend(fileMsg, currentView)
        } catch (err) {
            console.error('文件上传失败', err)
            alert('文件上传失败，请查看控制台')
        } finally {
            setLoading(false)
            if (fileInputRef.current) fileInputRef.current.value = ''
        }
    }

    const handleDeleteMessage = async (msgId: string) => {
        try {
            await messageApi.deleteMessage(msgId)
            setMessages(prev => prev.filter(m => m.id !== msgId))
        } catch { alert('删除失败') }
    }

    const handleToggleReaction = async (msgId: string, emoji: string) => {
        if (!user) return
        setReactions(prev => {
            const next = new Map(prev)
            const list = next.get(msgId) ?? []
            const existing = list.find(r => r.emoji === emoji)
            if (existing) {
                if (existing.isMine) {
                    const updated = list.map(r => r.emoji === emoji ? { ...r, count: r.count - 1, isMine: false } : r).filter(r => r.count > 0)
                    next.set(msgId, updated)
                } else {
                    next.set(msgId, list.map(r => r.emoji === emoji ? { ...r, count: r.count + 1, isMine: true } : r))
                }
            } else {
                next.set(msgId, [...list, { emoji, count: 1, isMine: true }])
            }
            return next
        })
        // Fire-and-forget API call; ignore errors silently for optimistic UX
        const myReaction = (reactions.get(msgId) ?? []).find(r => r.emoji === emoji)
        if (myReaction?.isMine) {
            reactionApi.removeReaction(msgId, emoji).catch(() => { })
        } else {
            reactionApi.addReaction(msgId, emoji).catch(() => { })
        }
    }

    const handleAddEmoji = (msgId: string, emoji: string) => {
        handleToggleReaction(msgId, emoji)
        setEmojiPickerFor(null)
    }

    const handleMarkRead = useCallback((msgId: string) => {
        if (markedRead.current.has(msgId)) return
        markedRead.current.add(msgId)
        // Best-effort API call
        const channelId = currentView.type === 'channel' ? currentView.id : 'dm'
        messageApi.markRead(msgId, channelId).catch(() => { })
    }, [currentView])
    const openDM = (uid: string, name: string) => {
        setCurrentView({ type: 'dm', uid, name })
        setDmUnreads(prev => ({ ...prev, [uid]: 0 }))
        if (!contacts.some(c => c.uid === uid)) {
            setContacts(prev => [...prev, { uid, name }])
        }
        contactsApi.updateContactStatus('add', uid).catch(err => {
            console.error("Failed to update contact status", err)
        })
    }

    // 当前视图标题
    const viewTitle = currentView.type === 'channel'
        ? `#${currentView.id} `
        : currentView.name

    const filteredUsers = mentionQuery !== null
        ? Object.values(userDirectory).filter(u => u.name.toLowerCase().includes(mentionQuery))
        : []

    const selfTypingTimeout = useRef<number | null>(null)
    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value)

        // Typing event
        if (!selfTypingTimeout.current) {
            const channelId = currentView.type === 'channel' ? currentView.id : undefined
            const recipientId = currentView.type === 'dm' ? currentView.uid : undefined
            messageApi.sendTyping(true, channelId, recipientId).catch(() => { })
        }
        if (selfTypingTimeout.current) window.clearTimeout(selfTypingTimeout.current)
        selfTypingTimeout.current = window.setTimeout(() => {
            const channelId = currentView.type === 'channel' ? currentView.id : undefined
            const recipientId = currentView.type === 'dm' ? currentView.uid : undefined
            messageApi.sendTyping(false, channelId, recipientId).catch(() => { })
            selfTypingTimeout.current = null
        }, 3000)

        // Mentions toggle
        const val = e.target.value
        const cursor = e.target.selectionStart
        const textBefore = val.slice(0, cursor)
        const atIndex = textBefore.lastIndexOf('@')
        if (atIndex !== -1 && (atIndex === 0 || textBefore[atIndex - 1] === ' ')) {
            setMentionQuery(textBefore.slice(atIndex + 1))
            setMentionIndex(0)
        } else {
            setMentionQuery(null)
        }
    }

    const insertMention = (name: string) => {
        if (!inputRef.current) return
        const cursor = inputRef.current.selectionStart
        const textBeforeCursor = input.slice(0, cursor)
        const textAfterCursor = input.slice(cursor)
        const match = textBeforeCursor.match(/(^|\s)@(\S*)$/)
        if (match) {
            const beforeMention = textBeforeCursor.slice(0, match.index! + match[1].length)
            const newText = beforeMention + `@${name} ` + textAfterCursor
            setInput(newText)
            setMentionQuery(null)
            setTimeout(() => {
                if (inputRef.current) {
                    inputRef.current.focus()
                    const newCursor = beforeMention.length + name.length + 2
                    inputRef.current.setSelectionRange(newCursor, newCursor)
                }
            }, 0)
        }
    }

    if (!user) return null

    const otherUsers = Object.entries(userDirectory).filter(([uid]) => uid !== user.id)

    return (
        <div className="flex h-screen overflow-hidden bg-slate-100 dark:bg-slate-950">
            {/* Sidebar (Channels/DMs) */}
            <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col shrink-0">
                {/* Logo */}
                <div className="h-14 border-b border-slate-800 flex items-center gap-3 px-4">
                    <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-white text-sm shadow-lg shadow-indigo-500/20">iP</div>
                    <span className="font-bold text-white text-base tracking-tight">iProTalk</span>
                </div>

                <div className="flex-1 overflow-y-auto py-3 space-y-1">
                    {/* 频道列表 */}
                    <div className="px-3 mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">频道</span>
                        <button onClick={() => setShowCreateChannel(true)} className="text-slate-500 hover:text-white transition-colors" title="创建频道">
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                    {[{ id: 'general', name: 'general' }, ...remoteChannels.map((c: { id: string, name: string }) => ({ id: c.name, name: c.name }))].filter((v, i, a) => a.findIndex(t => t.id === v.id) === i).map(c => (
                        <button
                            key={c.id}
                            onClick={() => setCurrentView({ type: 'channel', id: c.id })}
                            className={`w - full flex items - center gap - 2 px - 3 py - 1.5 rounded - md mx - 1 text - sm transition - colors ${currentView.type === 'channel' && currentView.id === c.id
                                ? 'bg-indigo-600/30 text-white'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                } `}
                        >
                            <Hash className="w-4 h-4 shrink-0" />
                            <span className="truncate">{c.name}</span>
                        </button>
                    ))}

                    {/* 私信列表 */}
                    <div className="px-3 mt-4 mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">私信</span>
                        <button onClick={() => setShowSearch(true)} className="text-slate-500 hover:text-white transition-colors" title="搜索用户">
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                    {contacts.map(c => (
                        <button
                            key={c.uid}
                            onClick={() => openDM(c.uid, c.name)}
                            className={`w-full flex items-center justify-between px-3 py-1.5 rounded-md mx-1 text-sm transition-colors ${currentView.type === 'dm' && currentView.uid === c.uid
                                ? 'bg-indigo-600/30 text-white'
                                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                }`}
                        >
                            <div className="flex items-center gap-2 truncate">
                                <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                                    {c.name[0]?.toUpperCase()}
                                </div>
                                <span className="truncate">{c.name}</span>
                            </div>
                            {dmUnreads[c.uid] > 0 && (
                                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 min-w-4 text-center">
                                    {dmUnreads[c.uid]}
                                </span>
                            )}
                        </button>
                    ))}

                    {/* 成员 */}
                    <div className="px-3 mt-4 mb-1">
                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">成员 ({otherUsers.length + 1})</span>
                    </div>
                    {otherUsers.map(([uid, uinfo]) => (
                        <button
                            key={uid}
                            onClick={() => openDM(uid, uinfo.name)}
                            className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md mx-1 text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                            title={`与 ${uinfo.name} 私信`}
                        >
                            <div className="relative shrink-0">
                                <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                                    {uinfo.name[0]?.toUpperCase()}
                                </div>
                                <span className={`absolute - bottom - 0.5 - right - 0.5 w - 2 h - 2 rounded - full border border - slate - 900 ${onlineUsers.has(uid) ? 'bg-green-500' : 'bg-slate-500'} `} />
                            </div>
                            <span className="truncate">{uinfo.name}</span>
                        </button>
                    ))}
                    <button className="w-full flex items-center gap-2 px-3 py-1.5 rounded-md mx-1 text-sm text-indigo-400 italic">
                        <div className="relative shrink-0">
                            <div className="w-6 h-6 rounded-full bg-indigo-600/30 flex items-center justify-center text-xs font-bold text-indigo-300">
                                {user.name[0]?.toUpperCase()}
                            </div>
                            <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-green-500 rounded-full border border-slate-900" />
                        </div>
                        <span className="truncate">{user.name} (我)</span>
                    </button>
                </div>

                {/* 底部用户信息 */}
                <div className="h-14 border-t border-slate-800 flex items-center justify-between px-3">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-bold text-xs text-white shrink-0 relative overflow-hidden">
                            <img
                                src={`/ api / users / ${user.id}/avatar?t=${Date.now()}`}
                                onError={(e) => { e.currentTarget.style.display = 'none' }}
                                className="absolute inset-0 w-full h-full object-cover"
                                alt=""
                            />
                            <span>{user.name.slice(0, 2).toUpperCase()}</span>
                        </div >
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                            <div className="flex items-center gap-1">
                                <KeyRound className={`w-3 h-3 ${keysStatus === 'ready' ? 'text-green-500' : keysStatus === 'error' ? 'text-red-400' : 'text-yellow-400'}`} />
                                <span className="text-[10px] text-slate-400 truncate">{keysStatusText}</span>
                            </div>
                        </div>
                    </div >
                    <div className="flex items-center gap-1">
                        {user.is_admin && (
                            <button onClick={() => setShowAdmin(true)} className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition-all shrink-0" title="管理面板">
                                <Shield className="w-4 h-4" />
                            </button>
                        )}
                        <button onClick={() => setShowSettings(true)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all shrink-0" title="设置">
                            <Settings className="w-4 h-4" />
                        </button>
                    </div>
                </div >
            </div >

            {/* Main Chat Area */}
            <div className="flex-1 flex overflow-hidden">
                <div className="flex-1 flex flex-col min-w-0 h-full bg-white dark:bg-slate-900 border-x border-slate-200 dark:border-slate-800">
                    <header className="h-14 shrink-0 flex items-center justify-between px-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 z-10">
                        <div className="flex items-center gap-2">
                            {currentView.type === 'channel'
                                ? <Hash className="text-slate-500 w-5 h-5" />
                                : <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white">
                                    {(currentView as { name: string }).name[0]?.toUpperCase()}
                                </div>
                            }
                            <h2 className="font-bold text-white">{viewTitle}</h2>
                            {user?.e2ee_initialized ? (
                                <span className="bg-green-500/10 text-green-400 text-[10px] px-2 py-0.5 rounded-full border border-green-500/20 flex items-center gap-1 ml-1 cursor-default" title="E2EE 端对端加密已启用">
                                    <KeyRound className="w-3 h-3 text-green-400" /> E2EE 已启用
                                </span>
                            ) : (
                                <button
                                    onClick={() => navigate('/setup')}
                                    className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 hover:text-amber-300 text-[10px] px-2 py-0.5 rounded-full border border-amber-500/20 hover:border-amber-500/40 flex items-center gap-1 ml-1 transition-all cursor-pointer font-medium"
                                    title="点击初始化端对端加密 (E2EE)"
                                >
                                    <KeyRound className="w-3 h-3 text-amber-400" /> 启用 E2EE
                                </button>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setShowMsgSearch(true)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all" title="搜索消息">
                                <Search className="w-4 h-4" />
                            </button>
                            <button onClick={() => setShowSearch(true)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all" title="查找用户">
                                <Users className="w-4 h-4" />
                            </button>
                        </div>
                    </header >

                    {/* 公告横幅 */}
                    {
                        currentView.type === 'channel' && (
                            (() => {
                                const ch = remoteChannels.find((c: { id: string }) => c.id === (currentView as { id: string }).id) as { announcement?: string } | undefined
                                return ch?.announcement ? <AnnouncementBanner text={ch.announcement} /> : null
                            })()
                        )
                    }

                    {/* 消息列表 */}
                    <main ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-1">
                        {historyLoading && (
                            <div className="flex justify-center py-8">
                                <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                            </div>
                        )}
                        {!historyLoading && messages.length === 0 && (
                            <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-3 py-16">
                                <MessageSquare className="w-12 h-12 opacity-20" />
                                <p className="text-sm">暂无消息，开始对话吧！</p>
                            </div>
                        )}

                        {messages.map((msg, idx) => {
                            const prevMsg = messages[idx - 1]
                            const showHeader = !prevMsg || prevMsg.senderId !== msg.senderId ||
                                (msg.timestamp - prevMsg.timestamp) > 300
                            const isHovered = hoveredMsg === msg.id
                            const msgReactions = reactions.get(msg.id) ?? []
                            const fileMatch = msg.text.match(FILE_PATTERN)

                            return (
                                <MessageReadWrapper
                                    key={msg.id}
                                    msgId={msg.id}
                                    isMe={msg.isMe}
                                    onVisible={handleMarkRead}
                                >
                                    <motion.div
                                        id={`msg-${msg.id}`}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`group relative flex items-start gap-3 px-2 py-0.5 rounded-lg hover:bg-slate-900/50 ${msg.isMe ? 'flex-row-reverse' : ''} ${showHeader ? 'mt-3' : 'mt-0.5'}`}
                                        onMouseEnter={() => setHoveredMsg(msg.id)}
                                        onMouseLeave={() => { setHoveredMsg(null); setEmojiPickerFor(null) }}
                                        onContextMenu={(e) => {
                                            e.preventDefault()
                                            setCtxMenu({ x: e.clientX, y: e.clientY, msgId: msg.id, text: msg.text, isPinned: pinnedMsgIds.has(msg.id), isMine: msg.isMe })
                                        }}
                                    >
                                        {/* 头像 */}
                                        {showHeader ? (
                                            <div className="w-9 h-9 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold text-sm shrink-0 mt-0.5">
                                                {msg.sender[0]?.toUpperCase()}
                                            </div>
                                        ) : (
                                            <div className="w-9 shrink-0" />
                                        )}

                                        <div className={`flex-1 min-w-0 ${msg.isMe ? 'text-right' : ''}`}>
                                            {showHeader && (
                                                <div className={`flex items-baseline gap-2 mb-1 ${msg.isMe ? 'flex-row-reverse' : ''}`}>
                                                    <span className="font-semibold text-sm text-white">{msg.sender}</span>
                                                </div>
                                            )}

                                            {/* 引用回复展示 */}
                                            {msg.replyTo && (
                                                <div className={`${msg.isMe ? 'flex justify-end' : ''}`}>
                                                    <MessageReply reply={msg.replyTo} />
                                                </div>
                                            )}

                                            {/* 转发标识 */}
                                            {msg.forwardInfo && (
                                                <div className={`flex items-center gap-1 text-xs text-slate-400 mb-1 ${msg.isMe ? 'flex-row-reverse' : ''}`}>
                                                    <Forward className="w-3 h-3 shrink-0" />
                                                    <span>转发自 {msg.forwardInfo.original_sender_name}</span>
                                                </div>
                                            )}

                                            <div className={`flex items-end gap-2 ${msg.isMe ? 'flex-row-reverse' : ''}`}>
                                                {editingMsgId === msg.id ? (
                                                    <div className="flex flex-col gap-2 min-w-[200px]">
                                                        <textarea
                                                            className="w-full bg-slate-900 border border-slate-700 text-white rounded p-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
                                                            rows={2}
                                                            value={editInput}
                                                            onChange={(e) => setEditInput(e.target.value)}
                                                            autoFocus
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Escape') setEditingMsgId(null)
                                                                if (e.key === 'Enter' && !e.shiftKey) {
                                                                    e.preventDefault()
                                                                    handleSaveEdit(msg.id)
                                                                }
                                                            }}
                                                        />
                                                        <div className="flex justify-end gap-2">
                                                            <button onClick={() => setEditingMsgId(null)} className="p-1 text-slate-400 hover:text-white bg-slate-800 rounded">
                                                                <X className="w-3.5 h-3.5" />
                                                            </button>
                                                            <button onClick={() => handleSaveEdit(msg.id)} className="p-1 text-green-400 hover:text-green-300 bg-slate-800 rounded">
                                                                <Check className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className={`relative px-4 py-2.5 rounded-2xl text-sm ${msg.isMe
                                                        ? 'bg-indigo-600 text-white rounded-tr-none'
                                                        : 'bg-slate-800 text-slate-100 rounded-tl-none'
                                                        } ${!msg.isMe && msg.mentions?.includes(user.id) ? 'ring-2 ring-yellow-400/50' : ''}`}>
                                                        {fileMatch ? (
                                                            <FileMessage fileName={fileMatch[1]} fileUrl={fileMatch[2]} />
                                                        ) : (
                                                            <div className="whitespace-pre-wrap break-words [&_a]:text-blue-300 [&_a]:underline">
                                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                                    {msg.isDecrypted ? msg.text : '正在解密...'}
                                                                </ReactMarkdown>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                <span className="text-[10px] text-slate-500 shrink-0 mb-1">
                                                    {msg.time}
                                                    {msg.isMe && msg.readBy && msg.readBy.length > 0 && (
                                                        <span className="ml-1 text-blue-400" title={`已读: ${msg.readBy.map(uid => userDirectory[uid]?.name || uid).join(', ')}`}>
                                                            ✓✓
                                                        </span>
                                                    )}
                                                    {msg.isMe && (!msg.readBy || msg.readBy.length === 0) && (
                                                        <span className="ml-1 text-slate-600">
                                                            ✓
                                                        </span>
                                                    )}
                                                </span>
                                            </div>

                                            {/* Reactions */}
                                            {msgReactions.length > 0 && (
                                                <div className={`mt-1 ${msg.isMe ? 'flex justify-end' : ''}`}>
                                                    <MessageReaction
                                                        reactions={msgReactions}
                                                        onToggle={(emoji) => handleToggleReaction(msg.id, emoji)}
                                                    />
                                                </div>
                                            )}

                                            {/* Thread indicator */}
                                            {replyCountMap[msg.id] > 0 && (
                                                <button
                                                    onClick={() => setActiveThreadId(msg.id)}
                                                    className="mt-1 text-[10px] font-medium text-indigo-500 hover:text-indigo-600 flex items-center gap-1 transition-colors"
                                                >
                                                    <MessageSquare size={10} />
                                                    {replyCountMap[msg.id]} 条回复
                                                </button>
                                            )}
                                        </div>

                                        {/* hover操作菜单 */}
                                        <AnimatePresence>
                                            {isHovered && (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.9 }}
                                                    animate={{ opacity: 1, scale: 1 }}
                                                    exit={{ opacity: 0, scale: 0.9 }}
                                                    className={`absolute top-0 ${msg.isMe ? 'left-2' : 'right-2'} flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg px-1 py-0.5 shadow-lg z-10`}
                                                >
                                                    {/* Emoji reaction button */}
                                                    <div className="relative">
                                                        <button
                                                            onClick={() => setEmojiPickerFor(prev => prev === msg.id ? null : msg.id)}
                                                            className="p-1.5 text-slate-400 hover:text-yellow-400 rounded transition-colors"
                                                            title="添加表情"
                                                        >
                                                            <Smile className="w-3.5 h-3.5" />
                                                        </button>
                                                        {emojiPickerFor === msg.id && (
                                                            <div className={`absolute bottom-full mb-1 ${msg.isMe ? 'right-0' : 'left-0'} z-20`}>
                                                                <EmojiPicker
                                                                    onSelect={(emoji) => handleAddEmoji(msg.id, emoji)}
                                                                    onClose={() => setEmojiPickerFor(null)}
                                                                />
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Reply button */}
                                                    <button
                                                        onClick={() => setReplyTo({ id: msg.id, sender: msg.sender, text: msg.text })}
                                                        className="p-1.5 text-slate-400 hover:text-indigo-400 rounded transition-colors"
                                                        title="回复"
                                                    >
                                                        <Reply className="w-3.5 h-3.5" />
                                                    </button>

                                                    {/* Pin button */}
                                                    <button
                                                        onClick={() => {
                                                            const channelId = currentView.type === 'channel' ? currentView.id : null
                                                            if (pinnedMsgIds.has(msg.id)) {
                                                                messageApi.unpinMessage(msg.id)
                                                                setPinnedMsgIds(prev => { const s = new Set(prev); s.delete(msg.id); return s })
                                                            } else {
                                                                messageApi.pinMessage(msg.id, channelId, msg.text)
                                                                setPinnedMsgIds(prev => new Set([...prev, msg.id]))
                                                            }
                                                        }}
                                                        className={`p-1.5 rounded transition-colors ${pinnedMsgIds.has(msg.id) ? 'text-yellow-400 hover:text-yellow-300' : 'text-slate-400 hover:text-yellow-400'}`}
                                                        title={pinnedMsgIds.has(msg.id) ? '取消置顶' : '置顶'}
                                                    >
                                                        <Pin className="w-3.5 h-3.5" />
                                                    </button>

                                                    {/* Forward button */}
                                                    <button
                                                        onClick={() => setForwardMsgId(msg.id)}
                                                        className="p-1.5 text-slate-400 hover:text-green-400 rounded transition-colors"
                                                        title="转发"
                                                    >
                                                        <Forward className="w-3.5 h-3.5" />
                                                    </button>

                                                    {msg.isMe && !fileMatch && msg.isDecrypted && (
                                                        <button
                                                            onClick={() => { setEditingMsgId(msg.id); setEditInput(msg.text); }}
                                                            className="p-1.5 text-slate-400 hover:text-blue-400 rounded transition-colors"
                                                            title="编辑"
                                                        >
                                                            <Edit3 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}

                                                    {msg.isMe && (
                                                        <button
                                                            onClick={() => handleDeleteMessage(msg.id)}
                                                            className="p-1.5 text-slate-400 hover:text-red-400 rounded transition-colors"
                                                            title="删除"
                                                        >
                                                            <Trash2 className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </motion.div>
                                </MessageReadWrapper>
                            )
                        })}
                    </main>

                    {/* Typing Indicator */}
                    <div className="h-4 px-4 overflow-hidden">
                        {typingUsers.size > 0 && (
                            <div className="text-[10px] text-slate-500 italic flex items-center gap-2">
                                <div className="flex gap-0.5">
                                    <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <span className="w-1 h-1 bg-slate-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                                <span>
                                    {Array.from(typingUsers).map(uid => userDirectory[uid]?.name || uid.slice(0, 8)).join(', ')} 正在输入...
                                </span>
                            </div>
                        )}
                    </div>

                    {/* 输入区 */}
                    <footer className="p-3 border-t border-slate-800 bg-slate-950 shrink-0">
                        {/* 回复提示条 */}
                        {replyTo && (
                            <div className="flex items-center justify-between px-3 py-1.5 mb-2 bg-slate-800 rounded-lg border-l-2 border-indigo-500 text-xs text-slate-400">
                                <span>回复 <span className="text-indigo-400 font-medium">{replyTo.sender}</span>：{replyTo.text.slice(0, 40)}{replyTo.text.length > 40 ? '…' : ''}</span>
                                <button onClick={() => setReplyTo(null)} className="ml-2 text-slate-500 hover:text-white transition-colors">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        )}
                        {/* Mentions Popup */}
                        <AnimatePresence>
                            {mentionQuery !== null && filteredUsers.length > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="absolute bottom-full mb-2 bg-slate-800 border border-slate-700 rounded-xl shadow-xl w-64 max-h-48 overflow-y-auto z-10 p-1"
                                >
                                    <div className="text-xs font-semibold text-slate-500 uppercase px-2 py-1 mb-1">
                                        提及人员
                                    </div>
                                    {filteredUsers.map((u, i) => (
                                        <button
                                            key={u.publicKey}
                                            type="button"
                                            onClick={() => insertMention(u.name)}
                                            onMouseEnter={() => setMentionIndex(i)}
                                            className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm text-left transition-colors ${i === mentionIndex ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-700'}`}
                                        >
                                            <div className="w-6 h-6 rounded-full bg-slate-700 font-bold flex items-center justify-center shrink-0 text-white">
                                                {u.name[0]?.toUpperCase()}
                                            </div>
                                            <span className="truncate">{u.name}</span>
                                        </button>
                                    ))}
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <form onSubmit={handleSubmit} className="flex items-end gap-2 bg-slate-800 rounded-xl px-3 py-2 border border-slate-700 focus-within:border-indigo-500 transition-colors relative">
                            <button
                                type="button"
                                onClick={() => fileInputRef.current?.click()}
                                disabled={loading || keysStatus !== 'ready'}
                                className="p-1.5 text-slate-400 hover:text-indigo-400 transition-colors disabled:opacity-40 shrink-0 self-end mb-0.5"
                            >
                                <Paperclip className="w-5 h-5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setShowEmojiPicker(prev => !prev)}
                                disabled={loading || keysStatus !== 'ready'}
                                className="p-1.5 text-slate-400 hover:text-yellow-400 transition-colors disabled:opacity-40 shrink-0 self-end mb-0.5 text-lg leading-none"
                                title="表情"
                            >
                                😊
                            </button>
                            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />

                            <textarea
                                ref={inputRef}
                                rows={1}
                                placeholder={keysStatus === 'ready' ? `发送消息到 ${viewTitle}（端对端加密）` : keysStatusText}
                                className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none resize-none self-center text-sm leading-relaxed max-h-32"
                                value={input}
                                disabled={loading || keysStatus !== 'ready'}
                                onChange={handleInput}
                                onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                                    if (mentionQuery !== null && filteredUsers.length > 0) {
                                        if (e.key === 'ArrowUp') {
                                            e.preventDefault()
                                            setMentionIndex(prev => (prev > 0 ? prev - 1 : filteredUsers.length - 1))
                                            return
                                        } else if (e.key === 'ArrowDown') {
                                            e.preventDefault()
                                            setMentionIndex(prev => (prev < filteredUsers.length - 1 ? prev + 1 : 0))
                                            return
                                        } else if (e.key === 'Enter' || e.key === 'Tab') {
                                            e.preventDefault()
                                            insertMention(filteredUsers[mentionIndex].name)
                                            return
                                        } else if (e.key === 'Escape') {
                                            setMentionQuery(null)
                                            return
                                        }
                                    }
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault()
                                        handleSubmit(e as unknown as React.FormEvent)
                                    }
                                }}
                            />

                            <button
                                type="submit"
                                disabled={loading || !input.trim() || keysStatus !== 'ready'}
                                className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all shrink-0 self-end disabled:opacity-40 disabled:grayscale"
                            >
                                {loading
                                    ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    : <Send className="w-5 h-5" />
                                }
                            </button>
                        </form>
                        <p className="text-[10px] text-slate-600 text-center mt-1">
                            <KeyRound className="w-3 h-3 inline mr-1" />所有消息均经过端对端加密 · Enter 发送 · Shift+Enter 换行
                        </p>
                    </footer>
                </div >

                <AnimatePresence>
                    {activeThreadId && activeThreadMessage && (
                        <ThreadSidebar
                            rootMessage={activeThreadMessage}
                            replies={repliesToActiveThread}
                            onClose={() => setActiveThreadId(null)}
                            onJumpToMessage={handleJumpToMessage}
                        />
                    )}
                </AnimatePresence>
            </div>

            {/* ===== 弹窗 ===== */}
            {showSettings && <UserSettingsModal onClose={() => setShowSettings(false)} />}
            {showCreateChannel && <ChannelCreateModal onClose={() => setShowCreateChannel(false)} />}
            {
                showSearch && (
                    <UserSearchModal
                        onClose={() => setShowSearch(false)}
                        onStartDM={(uid, name) => { openDM(uid, name); setShowSearch(false) }}
                    />
                )
            }
            {
                showMsgSearch && user && (
                    <MessageSearch
                        channelId={currentView.type === 'channel' ? currentView.id : undefined}
                        dmUid={currentView.type === 'dm' ? currentView.uid : undefined}
                        userDirectory={userDirectory}
                        currentUser={user}
                        onClose={() => setShowMsgSearch(false)}
                        onJumpTo={handleJumpToMessage}
                    />
                )
            }
            {
                forwardMsgId !== null && (
                    <ForwardModal
                        messageId={forwardMsgId}
                        channels={remoteChannels.map((c: { id: string; name: string }) => ({ id: c.id, name: c.name }))}
                        contacts={contacts.map(c => ({ user_id: c.uid, name: c.name }))}
                        onClose={() => setForwardMsgId(null)}
                    />
                )
            }
            {
                ctxMenu && (
                    <ContextMenu
                        x={ctxMenu.x}
                        y={ctxMenu.y}
                        visible={true}
                        isPinned={ctxMenu.isPinned}
                        isMine={ctxMenu.isMine}
                        onClose={() => setCtxMenu(null)}
                        onOpenThread={() => {
                            setActiveThreadId(ctxMenu.msgId)
                            setCtxMenu(null)
                        }}
                        onReply={() => {
                            const m = messages.find(m => m.id === ctxMenu.msgId)
                            if (m) setReplyTo({ id: m.id, sender: m.sender, text: m.text })
                            setCtxMenu(null)
                        }}
                        onEdit={ctxMenu.isMine ? () => {
                            const msg = messages.find(m => m.id === ctxMenu.msgId)
                            if (msg) { setEditingMsgId(msg.id); setEditInput(msg.text) }
                            setCtxMenu(null)
                        } : undefined}
                        onForward={() => { setForwardMsgId(ctxMenu.msgId); setCtxMenu(null) }}
                        onPin={() => {
                            const cid = currentView.type === 'channel' ? currentView.id : null
                            messageApi.pinMessage(ctxMenu.msgId, cid, ctxMenu.text)
                            setPinnedMsgIds(prev => new Set([...prev, ctxMenu.msgId]))
                            setCtxMenu(null)
                        }}
                        onUnpin={() => {
                            messageApi.unpinMessage(ctxMenu.msgId)
                            setPinnedMsgIds(prev => { const s = new Set(prev); s.delete(ctxMenu.msgId); return s })
                            setCtxMenu(null)
                        }}
                        onDelete={ctxMenu.isMine ? () => { handleDeleteMessage(ctxMenu.msgId); setCtxMenu(null) } : undefined}
                    />
                )
            }
            <AnimatePresence>
                {showAdmin && (
                    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-hidden">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: 20 }}
                            className="bg-slate-900 border border-slate-800 w-full max-w-5xl h-[90vh] rounded-3xl shadow-2xl overflow-hidden flex flex-col relative"
                        >
                            <div className="flex items-center justify-between p-4 border-b border-slate-800 shrink-0">
                                <span className="text-sm font-semibold text-slate-400">Administration Control Center</span>
                                <button onClick={() => setShowAdmin(false)} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto p-6 md:p-10 custom-scrollbar">
                                <AdminPanel />
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div >
    )
}
