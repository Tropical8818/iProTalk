import { useState, useCallback } from 'react';
import { Search, X, MessageCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { messageApi, StoredMessage } from '../api/index';
import { importPrivateKey, importPublicKey, deriveSharedSecret, decryptSessionKey, decryptMessage } from '../lib/crypto';

interface MessageSearchProps {
    channelId?: string;
    dmUid?: string;
    userDirectory: Record<string, { name: string; publicKey: string | null }>;
    currentUser: { id: string };
    onClose: () => void;
    onJumpTo?: (messageId: string) => void;
}

interface DecryptedSearchResult {
    id: string;
    timestamp: number;
    senderName: string;
    text: string;
}

export default function MessageSearch({ channelId, dmUid, userDirectory, currentUser, onClose, onJumpTo }: MessageSearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<DecryptedSearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [searchingDeep, setSearchingDeep] = useState(false);

    const decryptBatch = useCallback(async (msgs: StoredMessage[]): Promise<DecryptedSearchResult[]> => {
        const privKeyB64 = localStorage.getItem(`e2ee_private_key_${currentUser.id}`);
        const myPrivKey = privKeyB64 ? await importPrivateKey(privKeyB64) : null;
        const sharedSecrets = new Map<string, CryptoKey>();

        const decrypted = await Promise.all(msgs.map(async (stored) => {
            const p = stored.payload;
            let text = '[无法解密]';
            
            if (p.nonce === 'plaintext') {
                text = p.encrypted_blob;
            } else if (myPrivKey) {
                try {
                    const encKey = p.recipient_keys?.[currentUser.id];
                    if (encKey) {
                        const senderInfo = userDirectory[p.sender_id];
                        if (senderInfo && senderInfo.publicKey) {
                            let shared = sharedSecrets.get(p.sender_id);
                            if (!shared) {
                                const pub = await importPublicKey(senderInfo.publicKey);
                                shared = await deriveSharedSecret(myPrivKey, pub);
                                sharedSecrets.set(p.sender_id, shared);
                            }
                            const sessKey = await decryptSessionKey(encKey, shared);
                            text = await decryptMessage(sessKey, p.encrypted_blob, p.nonce);
                        }
                    }
                } catch { /* ignore */ }
            }
            return {
                id: stored.id,
                timestamp: stored.timestamp,
                senderName: userDirectory[p.sender_id]?.name || p.sender_id.slice(0, 8),
                text
            };
        }));
        return decrypted;
    }, [currentUser.id, userDirectory]);

    const handleSearch = useCallback(async (q: string, deep = false) => {
        if (q.trim().length < 2) { setResults([]); return; }
        if (deep) setSearchingDeep(true); else setLoading(true);

        try {
            // Fetch history (either specific channel or DM)
            let stored: StoredMessage[] = [];
            if (channelId) {
                const res = await messageApi.getGroupHistory(channelId);
                stored = res.data;
            } else if (dmUid) {
                const res = await messageApi.getDMHistory(dmUid);
                stored = res.data;
            }

            const decrypted = await decryptBatch(stored);
            const filtered = decrypted.filter(m =>
                m.text.toLowerCase().includes(q.toLowerCase()) ||
                m.senderName.toLowerCase().includes(q.toLowerCase())
            );
            setResults(filtered);
        } catch (e) {
            console.error('Search error', e);
        } finally {
            setLoading(false);
            setSearchingDeep(false);
        }
    }, [channelId, dmUid, decryptBatch]);

    const handleChange = (v: string) => {
        setQuery(v);
        handleSearch(v, false);
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
                            <div className="py-8 text-center text-slate-500 text-sm">正在加载并解密消息...</div>
                        ) : results.length === 0 && query.length >= 2 ? (
                            <div className="py-12 text-center text-slate-500 text-sm flex flex-col items-center gap-4">
                                <span>当前缓存中没有找到相关点消息</span>
                                <button
                                    onClick={() => handleSearch(query, true)}
                                    disabled={searchingDeep}
                                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-indigo-400 rounded-lg border border-slate-700 transition-all disabled:opacity-50"
                                >
                                    {searchingDeep ? '正在深度搜索...' : '开启深度搜索 (检索历史记录)'}
                                </button>
                            </div>
                        ) : results.length === 0 ? (
                            <div className="py-8 text-center text-slate-500 text-sm">输入关键字开始搜索 (支持内容与发送者)</div>
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
                                        <div className="flex justify-between items-baseline mb-0.5">
                                            <span className="text-sm font-semibold text-white">{msg.senderName}</span>
                                            <span className="text-[10px] text-slate-500">{new Date(msg.timestamp * 1000).toLocaleString()}</span>
                                        </div>
                                        <p className="text-sm text-slate-300 line-clamp-2">
                                            {msg.text}
                                        </p>
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
