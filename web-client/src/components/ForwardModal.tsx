import { useState } from 'react';
import { X, Forward } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { messageApi } from '../api/index';

interface Channel {
    id: string;
    name: string;
}

interface Contact {
    user_id: string;
    name: string;
}

interface ForwardModalProps {
    content: string;
    channels: Channel[];
    contacts: Contact[];
    onClose: () => void;
    onSuccess?: () => void;
}

export default function ForwardModal({ content, channels, contacts, onClose, onSuccess }: ForwardModalProps) {
    const [selectedChannel, setSelectedChannel] = useState<string>('');
    const [selectedUser, setSelectedUser] = useState<string>('');
    const [loading, setLoading] = useState(false);
    const [tab, setTab] = useState<'channel' | 'dm'>('channel');

    const handleForward = async () => {
        if (!selectedChannel && !selectedUser) return;
        setLoading(true);
        try {
            await messageApi.forwardMessage(
                content,
                selectedChannel || undefined,
                selectedUser || undefined,
            );
            onSuccess?.();
            onClose();
        } catch (err) {
            console.error('Forward failed', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="w-[400px] rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
                        <div className="flex items-center gap-2 font-semibold text-white">
                            <Forward size={18} className="text-blue-400" />
                            转发消息
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                            <X size={18} />
                        </button>
                    </div>

                    {/* Preview */}
                    <div className="px-5 py-3 bg-slate-800/50">
                        <p className="text-xs text-slate-400 mb-1">消息内容</p>
                        <p className="text-sm text-slate-300 truncate">{content.slice(0, 80)}{content.length > 80 ? '...' : ''}</p>
                    </div>

                    {/* Tabs */}
                    <div className="flex border-b border-slate-700">
                        {(['channel', 'dm'] as const).map((t) => (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === t ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-slate-200'}`}
                            >
                                {t === 'channel' ? '频道' : '私信'}
                            </button>
                        ))}
                    </div>

                    {/* Content */}
                    <div className="p-4 max-h-48 overflow-y-auto space-y-1">
                        {tab === 'channel' ? (
                            channels.length === 0 ? (
                                <p className="text-center text-slate-500 text-sm py-4">没有可用频道</p>
                            ) : channels.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => { setSelectedChannel(c.id); setSelectedUser(''); }}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedChannel === c.id ? 'bg-blue-500/20 text-blue-300' : 'text-slate-300 hover:bg-slate-700/50'}`}
                                >
                                    # {c.name}
                                </button>
                            ))
                        ) : (
                            contacts.length === 0 ? (
                                <p className="text-center text-slate-500 text-sm py-4">没有联系人</p>
                            ) : contacts.map(u => (
                                <button
                                    key={u.user_id}
                                    onClick={() => { setSelectedUser(u.user_id); setSelectedChannel(''); }}
                                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${selectedUser === u.user_id ? 'bg-blue-500/20 text-blue-300' : 'text-slate-300 hover:bg-slate-700/50'}`}
                                >
                                    {u.name}
                                </button>
                            ))
                        )}
                    </div>

                    {/* Footer */}
                    <div className="px-5 py-4 border-t border-slate-700 flex gap-3 justify-end">
                        <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:bg-slate-700 transition-colors">
                            取消
                        </button>
                        <button
                            onClick={handleForward}
                            disabled={loading || (!selectedChannel && !selectedUser)}
                            className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {loading ? '发送中...' : '转发'}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
