import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Send, Hash, Users, LogOut, MessageSquare } from 'lucide-react'
import { messageApi, subscribeToEvents } from '../api'

interface ChatProps {
    user: { id: string; name: string }
    onLogout: () => void
}

export const Chat = ({ user, onLogout }: ChatProps) => {
    const [messages, setMessages] = useState<any[]>([])
    const [input, setInput] = useState('')
    const [loading, setLoading] = useState(false)
    const scrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const unsubscribe = subscribeToEvents((msgData) => {
            console.log("Received SSE:", msgData)
            const payload = msgData.payload

            // Don't duplicate if we already have it (optimistic UI or simple check)
            setMessages((prev) => {
                // Generate a consistent ID or use one from backend if available
                const msgId = msgData.timestamp
                if (prev.some(m => m.timestamp === msgId)) return prev

                return [...prev, {
                    id: msgId + Math.random(), // React key
                    timestamp: msgId,
                    // Use payload.sender_id. If it matches current user, show 'You'
                    sender: payload.sender_id === user.id ? 'You' : payload.sender_id.slice(0, 8),
                    // Use payload.encrypted_blob as content for now
                    text: payload.encrypted_blob,
                    time: new Date(msgData.timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    isMe: payload.sender_id === user.id
                }]
            })
        })

        return () => unsubscribe()
    }, [user.id])

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight
        }
    }, [messages])

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!input.trim() || loading) return

        setLoading(true)
        try {
            // Pass current user ID
            await messageApi.sendMessage('general', input, user.id)
            setInput('')
        } catch (err) {
            console.error("Failed to send message", err)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex h-screen w-full bg-slate-950 overflow-hidden">
            {/* Sidebar */}
            <div className="w-72 bg-slate-900 border-r border-slate-800 flex flex-col">
                <div className="p-6 border-b border-slate-800 flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
                        iP
                    </div>
                    <span className="font-bold text-xl text-white tracking-tight">iProTalk</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    <div>
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-2">Channels</h3>
                        <div className="space-y-1">
                            <button className="w-full flex items-center gap-3 px-3 py-2 bg-indigo-500/10 text-indigo-400 rounded-lg group transition-colors">
                                <Hash className="w-4 h-4" />
                                <span className="font-medium">general</span>
                            </button>
                            <button className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded-lg group transition-colors text-left">
                                <Hash className="w-4 h-4" />
                                <span className="font-medium">development</span>
                            </button>
                        </div>
                    </div>

                    <div>
                        <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 px-2">Direct Messages</h3>
                        <div className="space-y-1">
                            {['Alice', 'Bob', 'Charlie'].map(user => (
                                <button key={user} className="w-full flex items-center gap-3 px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded-lg group transition-colors text-left">
                                    <div className="w-2 h-2 rounded-full bg-green-500" />
                                    <span className="font-medium">{user}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-slate-800 bg-slate-900/50">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-slate-700 border border-slate-600 flex items-center justify-center font-bold text-xs text-white">
                                {user.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-semibold text-white">{user.name}</span>
                                <span className="text-[10px] text-green-500">Connected</span>
                            </div>
                        </div>
                        <button
                            onClick={onLogout}
                            className="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                            title="Logout"
                        >
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col bg-slate-950">
                <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-950/50 backdrop-blur-md">
                    <div className="flex items-center gap-2">
                        <Hash className="text-slate-500 w-5 h-5" />
                        <h2 className="font-bold text-white uppercase tracking-tight">general</h2>
                    </div>
                    <div className="flex items-center gap-4">
                        <button className="p-2 text-slate-400 hover:text-white transition-colors">
                            <Users className="w-5 h-5" />
                        </button>
                    </div>
                </header>

                <main ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth">
                    {messages.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-full text-slate-500 space-y-4">
                            <MessageSquare className="w-12 h-12 opacity-20" />
                            <p>No messages yet. Start the conversation!</p>
                        </div>
                    )}
                    {messages.map(msg => (
                        <motion.div
                            initial={{ opacity: 0, x: msg.isMe ? 10 : -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={msg.id}
                            className={`flex items-start gap-4 group ${msg.isMe ? 'flex-row-reverse' : ''}`}
                        >
                            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 font-bold shrink-0">
                                {msg.sender[0]}
                            </div>
                            <div className={`flex-1 ${msg.isMe ? 'text-right' : ''}`}>
                                <div className={`flex items-center gap-2 mb-1 ${msg.isMe ? 'flex-row-reverse' : ''}`}>
                                    <span className="font-bold text-white">{msg.sender}</span>
                                    <span className="text-xs text-slate-500">{msg.time}</span>
                                </div>
                                <div className={`inline-block p-3 rounded-2xl max-w-[80%] text-left ${msg.isMe
                                    ? 'bg-indigo-600 text-white rounded-tr-none'
                                    : 'bg-slate-800 text-slate-300 rounded-tl-none'
                                    }`}>
                                    <p className="leading-relaxed">{msg.text}</p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </main>

                <footer className="p-6">
                    <form onSubmit={handleSubmit} className="relative flex items-center gap-4">
                        <div className="relative flex-1">
                            <input
                                type="text"
                                placeholder="Message #general"
                                className="w-full bg-slate-900 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 rounded-2xl py-4 pl-12 pr-4 text-white placeholder-slate-500 outline-none transition-all shadow-xl disabled:opacity-50"
                                value={input}
                                disabled={loading}
                                onChange={(e) => setInput(e.target.value)}
                            />
                            <MessageSquare className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                        </div>
                        <button
                            type="submit"
                            disabled={loading || !input.trim()}
                            className="bg-indigo-600 hover:bg-indigo-500 text-white p-4 rounded-2xl shadow-lg shadow-indigo-500/20 group transition-all shrink-0 disabled:opacity-50 disabled:grayscale"
                        >
                            {loading ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                <Send className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                            )}
                        </button>
                    </form>
                </footer>
            </div>
        </div>
    )
}
