import { useState, useCallback } from 'react';
import { Search, X, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { messageApi, StoredMessage } from '../api/index';

interface MessageSearchProps {
    channelId?: string;
    onClose: () => void;
    onJumpTo?: (messageId: string) => void;
}

function formatTimestamp(ts: number) {
    return new Date(ts * 1000).toLocaleString('zh-CN', {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

export default function MessageSearch({ channelId, onClose, onJumpTo }: MessageSearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<StoredMessage[]>([]);
    const [loading, setLoading] = useState(false);

    const doSearch = useCallback(async (q: string) => {
        if (q.trim().length < 2) { setResults([]); return; }
        setLoading(true);
        try {
            const res = await messageApi.searchMessages(q, channelId);
            setResults(res.data);
        } catch {
            setResults([]);
        } finally {
            setLoading(false);
        }
    }, [channelId]);

    const handleChange = (v: string) => {
        setQuery(v);
        doSearch(v);
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-black/60 backdrop-blur-sm" onClick={onClose}>
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="w-[540px] rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Search Input */}
                    <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-700">
                        <Search size={18} className="text-slate-400 shrink-0" />
                        <input
                            autoFocus
                            value={query}
                            onChange={e => handleChange(e.target.value)}
                            placeholder="搜索消息内容..."
                            className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-sm"
                        />
                        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
                            <X size={16} />
                        </button>
                    </div>

                    {/* Results */}
                    <div className="max-h-[400px] overflow-y-auto">
                        {loading ? (
                            <div className="py-8 text-center text-slate-500 text-sm">搜索中...</div>
                        ) : results.length === 0 && query.length >= 2 ? (
                            <div className="py-8 text-center text-slate-500 text-sm">没有找到相关消息</div>
                        ) : results.length === 0 ? (
                            <div className="py-8 text-center text-slate-500 text-sm">输入关键字开始搜索</div>
                        ) : (
                            results.map(msg => (
                                <button
                                    key={msg.id}
                                    onClick={() => { onJumpTo?.(msg.id); onClose(); }}
                                    className="w-full text-left px-4 py-3 hover:bg-slate-800/60 transition-colors flex items-start gap-3 border-b border-slate-800/50 last:border-0"
                                >
                                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                                        <MessageCircle size={14} className="text-slate-400" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs text-slate-400 mb-0.5">{formatTimestamp(msg.timestamp)}</p>
                                        <p className="text-sm text-slate-200 truncate">{msg.payload.encrypted_blob}</p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
