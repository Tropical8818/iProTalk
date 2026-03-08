import { useState } from 'react';
import { useGetInvitesQuery, useCreateInviteMutation, useDeleteInviteMutation } from '../store/api/invitesApi';
import { Link2, Trash2, Plus, Clock, Infinity as InfinityIcon, Copy, CheckCircle2, Loader2, Users } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function AdminInvites() {
    const { data: invites, isLoading } = useGetInvitesQuery();
    const [createInvite] = useCreateInviteMutation();
    const [deleteInvite] = useDeleteInviteMutation();

    const [isCreating, setIsCreating] = useState(false);
    const [copiedCode, setCopiedCode] = useState<string | null>(null);

    // Form state
    const [maxUses, setMaxUses] = useState<number>(-1);
    const [expiryHours, setExpiryHours] = useState<number>(0);

    const handleCreate = async () => {
        try {
            await createInvite({
                max_uses: maxUses === 0 ? -1 : maxUses,
                expires_hours: expiryHours === 0 ? undefined : expiryHours
            }).unwrap();
            setIsCreating(false);
            setMaxUses(-1);
            setExpiryHours(0);
        } catch (err) {
            console.error(err);
        }
    };

    const copyToClipboard = (code: string) => {
        const url = `${window.location.origin}/join/${code}`;
        navigator.clipboard.writeText(url);
        setCopiedCode(code);
        setTimeout(() => setCopiedCode(null), 2000);
    };

    if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h4 className="text-lg font-semibold text-white">Invite Links</h4>
                    <p className="text-sm text-slate-400">Create and manage invitation links for new users</p>
                </div>
                <button
                    onClick={() => setIsCreating(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
                >
                    <Plus className="w-4 h-4" /> Create Link
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
                                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Max Uses</label>
                                <select
                                    className="w-full bg-slate-950/50 border border-slate-700 rounded-xl py-2.5 px-4 text-white outline-none focus:border-indigo-500 transition-colors"
                                    value={maxUses}
                                    onChange={(e) => setMaxUses(Number(e.target.value))}
                                >
                                    <option value={-1}>Infinite Uses</option>
                                    <option value={1}>1 Use</option>
                                    <option value={5}>5 Uses</option>
                                    <option value={10}>10 Uses</option>
                                    <option value={25}>25 Uses</option>
                                    <option value={50}>50 Uses</option>
                                    <option value={100}>100 Uses</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wider">Expiration</label>
                                <select
                                    className="w-full bg-slate-950/50 border border-slate-700 rounded-xl py-2.5 px-4 text-white outline-none focus:border-indigo-500 transition-colors"
                                    value={expiryHours}
                                    onChange={(e) => setExpiryHours(Number(e.target.value))}
                                >
                                    <option value={0}>Never Expires</option>
                                    <option value={1}>1 Hour</option>
                                    <option value={6}>6 Hours</option>
                                    <option value={12}>12 Hours</option>
                                    <option value={24}>24 Hours (1 Day)</option>
                                    <option value={72}>72 Hours (3 Days)</option>
                                    <option value={168}>1 Week</option>
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
                                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium transition-colors"
                            >
                                Generate Invitation
                            </button>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="bg-slate-900/50 border border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-800">
                {!invites || invites.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 border border-slate-700">
                            <Link2 className="w-8 h-8 text-slate-500" />
                        </div>
                        <p className="text-slate-500">No active invitation links found.</p>
                    </div>
                ) : (
                    invites.map((invite) => (
                        <div key={invite.code} className="p-4 flex items-center justify-between hover:bg-slate-800/20 transition-colors group">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-xl flex items-center justify-center text-indigo-400">
                                    <Link2 className="w-5 h-5" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <code className="px-2 py-0.5 bg-slate-800 rounded border border-slate-700 text-indigo-400 font-mono text-sm uppercase">{invite.code}</code>
                                        <button
                                            onClick={() => copyToClipboard(invite.code)}
                                            className="p-1 text-slate-500 hover:text-white transition-colors"
                                            title="Copy Link"
                                        >
                                            {copiedCode === invite.code ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                                        </button>
                                    </div>
                                    <div className="flex items-center gap-4 mt-1">
                                        <span className="text-xs text-slate-500 flex items-center gap-1">
                                            {invite.max_uses === -1 ? (
                                                <><InfinityIcon className="w-3 h-3" /> Infinite Uses</>
                                            ) : (
                                                <><Users className="w-3 h-3" /> {invite.used_count} / {invite.max_uses} Uses</>
                                            )}
                                        </span>
                                        <span className="text-xs text-slate-500 flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {invite.expires_at ? new Date(invite.expires_at).toLocaleString() : 'Never Expires'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={() => confirm('Delete this invitation link?') && deleteInvite(invite.code)}
                                className="p-2 text-slate-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
