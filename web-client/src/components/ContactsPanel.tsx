import { useState } from 'react';
import { useGetContactsQuery, useUpdateContactStatusMutation } from '../store/api/contactsApi';
import { UserPlus, UserMinus, ShieldAlert, Search, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function ContactsPanel() {
    const { data: contacts, isLoading, error } = useGetContactsQuery({});
    const [updateContact, { isLoading: isUpdating }] = useUpdateContactStatusMutation();
    const [searchQuery, setSearchQuery] = useState('');
    const [newContactId, setNewContactId] = useState('');

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newContactId.trim()) return;
        await updateContact({ action: 'add', target_uid: newContactId.trim() });
        setNewContactId('');
    };

    const handleAction = async (action: 'add' | 'block' | 'remove', uid: string) => {
        await updateContact({ action, target_uid: uid });
    };

    return (
        <div className="flex flex-col h-full bg-slate-900 border-l border-slate-800 w-80">
            <div className="p-4 border-b border-slate-800">
                <h2 className="text-lg font-semibold text-white mb-4">Contacts</h2>

                <form onSubmit={handleAdd} className="flex gap-2 mb-4">
                    <input
                        type="text"
                        placeholder="User ID to add..."
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        value={newContactId}
                        onChange={(e) => setNewContactId(e.target.value)}
                    />
                    <button
                        type="submit"
                        disabled={isUpdating || !newContactId.trim()}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg disabled:opacity-50 transition-colors"
                    >
                        <UserPlus className="w-4 h-4" />
                    </button>
                </form>

                <div className="relative">
                    <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        type="text"
                        placeholder="Search contacts..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                {isLoading ? (
                    <div className="flex items-center justify-center h-full text-slate-500">
                        <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                ) : error ? (
                    <div className="text-center text-red-400 p-4 text-sm">Failed to load contacts</div>
                ) : (
                    <div className="space-y-1">
                        <AnimatePresence>
                            {contacts?.filter((c: { target_uid: string }) => c.target_uid.includes(searchQuery)).map((contact: { id: string; target_uid: string; status: string }) => (
                                <motion.div
                                    initial={{ opacity: 0, height: 0 }}
                                    animate={{ opacity: 1, height: 'auto' }}
                                    exit={{ opacity: 0, height: 0 }}
                                    key={contact.id}
                                    className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-800 transition-colors group"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-300">
                                            {contact.target_uid.substring(0, 2).toUpperCase()}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-sm font-medium text-slate-200 truncate w-32">{contact.target_uid}</span>
                                            <span className={`text-[10px] uppercase font-bold ${contact.status === 'blocked' ? 'text-red-400' : 'text-green-400'}`}>
                                                {contact.status}
                                            </span>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        {contact.status !== 'blocked' && (
                                            <button
                                                onClick={() => handleAction('block', contact.target_uid)}
                                                className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-md"
                                                title="Block User"
                                            >
                                                <ShieldAlert className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleAction('remove', contact.target_uid)}
                                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-md"
                                            title="Remove Contact"
                                        >
                                            <UserMinus className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                        {contacts?.length === 0 && (
                            <div className="text-center text-slate-500 text-sm p-4">No contacts found.</div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
