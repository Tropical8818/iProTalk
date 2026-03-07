import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Search, MessageSquare, User } from 'lucide-react'
import { usersApi } from '../api'

interface Props {
    onClose: () => void
    onStartDM: (uid: string, name: string) => void
}

interface UserResult {
    user_id: string
    name: string
    email?: string
    public_key: string | null
}

export default function UserSearchModal({ onClose, onStartDM }: Props) {
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<UserResult[]>([])
    const [loading, setLoading] = useState(false)
    const [searched, setSearched] = useState(false)

    const handleSearch = async (e?: React.FormEvent) => {
        e?.preventDefault()
        if (!query.trim()) return
        setLoading(true)
        setSearched(true)
        try {
            const res = await usersApi.searchUsers(query.trim())
            setResults(res.data)
        } catch {
            setResults([])
        } finally {
            setLoading(false)
        }
    }

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
            >
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-slate-800">
                        <h2 className="font-bold text-white text-lg">搜索用户</h2>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-all">
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* 搜索框 */}
                    <div className="p-4">
                        <form onSubmit={handleSearch} className="flex gap-2">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="按用户名或邮箱搜索..."
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    autoFocus
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl text-white placeholder-slate-500 outline-none transition-colors text-sm"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={loading || !query.trim()}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-colors disabled:opacity-50 text-sm font-medium"
                            >
                                {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : '搜索'}
                            </button>
                        </form>
                    </div>

                    {/* 结果列表 */}
                    <div className="px-4 pb-4 min-h-[120px] max-h-80 overflow-y-auto">
                        {loading && (
                            <div className="flex justify-center py-8">
                                <div className="w-6 h-6 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                            </div>
                        )}
                        {!loading && searched && results.length === 0 && (
                            <div className="flex flex-col items-center gap-2 py-8 text-slate-500">
                                <User className="w-10 h-10 opacity-30" />
                                <p className="text-sm">未找到匹配用户</p>
                            </div>
                        )}
                        {!loading && results.map(u => (
                            <div
                                key={u.user_id}
                                className="flex items-center justify-between py-3 border-b border-slate-800 last:border-0"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-300 font-bold text-sm">
                                        {u.name[0]?.toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-white">{u.name}</p>
                                        {u.email && <p className="text-xs text-slate-500">{u.email}</p>}
                                        {u.public_key && (
                                            <span className="text-[10px] text-green-400 flex items-center gap-1 mt-0.5">
                                                🔑 已设置E2EE
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <button
                                    onClick={() => onStartDM(u.user_id, u.name)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium transition-colors"
                                >
                                    <MessageSquare className="w-3.5 h-3.5" />
                                    私信
                                </button>
                            </div>
                        ))}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    )
}
