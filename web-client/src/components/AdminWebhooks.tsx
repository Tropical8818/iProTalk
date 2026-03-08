import { useState } from 'react';
import { useGetWebhooksQuery, useCreateWebhookMutation, useDeleteWebhookMutation } from '../store/api/webhooksApi';
import { useGetChannelsQuery } from '../store/api/channelsApi';
import { Webhook as WebhookIcon, Trash2, Plus, Copy, CheckCircle2, Loader2, MessageSquare, ExternalLink, ScrollText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Channel {
    id: string;
    name: string;
}

export default function AdminWebhooks() {
    const { data: webhooks, isLoading } = useGetWebhooksQuery();
    const { data: channels } = useGetChannelsQuery({});
    const [createWebhook] = useCreateWebhookMutation();
    const [deleteWebhook] = useDeleteWebhookMutation();

    const [isCreating, setIsCreating] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [copiedSecret, setCopiedSecret] = useState<string | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [channelId, setChannelId] = useState('');

    const handleCreate = async () => {
        if (!name || !channelId) return;
        try {
            await createWebhook({ name, channel_id: channelId }).unwrap();
            setIsCreating(false);
            setName('');
            setChannelId('');
        } catch (err) {
            console.error(err);
        }
    };

    const copyToClipboard = (text: string, type: 'id' | 'secret', id: string) => {
        navigator.clipboard.writeText(text);
        if (type === 'id') {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        } else {
            setCopiedSecret(id);
            setTimeout(() => setCopiedSecret(null), 2000);
        }
    };

    if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

    const getChannelName = (id: string) => {
        return channels?.find((c: Channel) => c.id === id)?.name || id;
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-lg font-semibold text-white">Incoming Webhooks</h4>
                    <p className="text-sm text-slate-400">Post messages to channels from external services</p>
                </div>
                <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
                >
                    <Plus className="w-4 h-4" /> Create Webhook
                </button>
            </div>

            <AnimatePresence>
                {isCreating && (
                    <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-slate-800/50 border border-slate-700 rounded-2xl p-5 overflow-hidden"
                    >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Webhook Name</label>
                                <input
                                    type="text"
                                    placeholder="e.g. GitHub Production"
                                    className="w-full bg-slate-950/50 border border-slate-700 rounded-xl py-2.5 px-4 text-white outline-none focus:border-indigo-500 transition-colors"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Target Channel</label>
                                <select
                                    className="w-full bg-slate-950/50 border border-slate-700 rounded-xl py-2.5 px-4 text-white outline-none focus:border-indigo-500 transition-colors"
                                    value={channelId}
                                    onChange={(e) => setChannelId(e.target.value)}
                                >
                                    <option value="">Select a channel...</option>
                                    {channels?.map((c: Channel) => (
                                        <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setIsCreating(false)}
                                className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={!name || !channelId}
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
                            >
                                Create Webhook
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800">
                {!webhooks || webhooks.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-700">
                            <WebhookIcon className="w-8 h-8 text-slate-500" />
                        </div>
                        <p className="text-slate-500">No webhooks configured yet.</p>
                    </div>
                ) : (
                    webhooks.map((hook) => (
                        <div key={hook.id} className="p-5 hover:bg-slate-800/20 transition-colors group">
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
                                        <WebhookIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h5 className="font-semibold text-white">{hook.name}</h5>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className="text-xs text-slate-500 flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 rounded-md border border-slate-700">
                                                <MessageSquare className="w-3 h-3" /> {getChannelName(hook.channel_id)}
                                            </span>
                                            <span className="text-xs text-slate-500 flex items-center gap-1.5 px-2 py-0.5 bg-slate-800 rounded-md border border-slate-700">
                                                <ScrollText className="w-3 h-3" /> Created {new Date(hook.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => confirm('Delete this webhook?') && deleteWebhook(hook.id)}
                                    className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 ml-16">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Webhook URL</label>
                                    <div className="flex items-center gap-2 bg-slate-950/50 border border-slate-800 rounded-lg p-2 group/input">
                                        <code className="text-xs text-indigo-400 truncate flex-1 font-mono">
                                            {window.location.origin}/api/webhooks/{hook.id}/send
                                        </code>
                                        <button
                                            onClick={() => copyToClipboard(`${window.location.origin}/api/webhooks/${hook.id}/send`, 'id', hook.id)}
                                            className="p-1 text-slate-600 hover:text-indigo-400 transition-colors"
                                        >
                                            {copiedId === hook.id ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Secret Key (X-Webhook-Secret)</label>
                                    <div className="flex items-center gap-2 bg-slate-950/50 border border-slate-800 rounded-lg p-2 group/input">
                                        <code className="text-xs text-emerald-400 truncate flex-1 font-mono">
                                            {hook.secret}
                                        </code>
                                        <button
                                            onClick={() => copyToClipboard(hook.secret, 'secret', hook.id)}
                                            className="p-1 text-slate-600 hover:text-emerald-400 transition-colors"
                                        >
                                            {copiedSecret === hook.id ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div className="p-4 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl flex items-start gap-4">
                <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400 shrink-0">
                    <ExternalLink className="w-4 h-4" />
                </div>
                <div className="text-sm">
                    <h5 className="font-semibold text-indigo-400 mb-1">Developer Guide</h5>
                    <p className="text-slate-400 leading-relaxed">
                        To post messages, send a <code className="text-indigo-300">POST</code> request to the Webhook URL with the <code className="text-indigo-300">X-Webhook-Secret</code> header.
                        Payload body: <code className="text-slate-300">{"{ \"content\": \"Hello World\", \"username\": \"Optional Override\" }"}</code>.
                    </p>
                </div>
            </div>
        </div>
    );
}
