import { useState, useRef, useEffect, useMemo } from 'react';
import { useGetUsersQuery, useToggleBanMutation, useToggleAdminMutation, useDeleteUserMutation, useResetPasswordMutation, useGetRegistrationSettingQuery, useToggleRegistrationSettingMutation, useGetServerStatsQuery } from '../store/api/adminApi';
import { Shield, Ban, UserX, KeyRound, Loader2, UserPlus, Users, Hash, MessageCircle, Search, MoreVertical, Link2, Webhook } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import AdminInvites from './AdminInvites';
import AdminWebhooks from './AdminWebhooks';

export interface AdminUser {
    id: string;
    name: string;
    email: string;
    is_admin: boolean;
    is_banned: boolean;
}

type AdminTab = 'users' | 'invites' | 'webhooks';

export default function AdminPanel() {
    const { data: users, isLoading, error } = useGetUsersQuery({});
    const { data: regSetting, refetch: refetchRegSetting } = useGetRegistrationSettingQuery();
    const { data: serverStats } = useGetServerStatsQuery();
    const [toggleBan] = useToggleBanMutation();
    const [toggleAdmin] = useToggleAdminMutation();
    const [deleteUser] = useDeleteUserMutation();
    const [resetPassword] = useResetPasswordMutation();
    const [toggleRegistration] = useToggleRegistrationSettingMutation();

    // Local State
    const [activeTab, setActiveTab] = useState<AdminTab>('users');
    const [searchQuery, setSearchQuery] = useState('');
    const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
    const [resetPwModalData, setResetPwModalData] = useState<{ id: string, name: string } | null>(null);
    const [newPassword, setNewPassword] = useState('');
    const [resetPwError, setResetPwError] = useState('');
    const [isResetting, setIsResetting] = useState(false);

    const dropdownRef = useRef<HTMLDivElement>(null);

    // Filter Users
    const filteredUsers = useMemo(() => {
        if (!users) return [];
        return users.filter((u: AdminUser) =>
            u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            u.email.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [users, searchQuery]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setActiveDropdown(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (isLoading) return <div className="flex h-64 items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-indigo-500" /></div>;
    if (error) return <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl">Failed to load users for administration.</div>;

    const handleToggleRegistration = async () => {
        try {
            await toggleRegistration().unwrap();
            refetchRegSetting();
        } catch (err) {
            console.error(err);
        }
    };

    const submitResetPassword = async () => {
        if (!resetPwModalData) return;
        if (newPassword.length < 6) {
            setResetPwError("Password must be at least 6 characters.");
            return;
        }

        setIsResetting(true);
        setResetPwError('');
        try {
            await resetPassword({ uid: resetPwModalData.id, new_password: newPassword }).unwrap();
            setResetPwModalData(null);
            setNewPassword('');
            alert('Password successfully reset.');
        } catch (err) {
            const error = err as { data?: { message?: string } | string };
            setResetPwError((typeof error.data === 'object' ? error.data?.message : error.data) || "Failed to reset password.");
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                        <Shield className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold text-white tracking-tight">System Administration</h3>
                        <p className="text-slate-400">Manage all users, settings, and workspace metrics</p>
                    </div>
                </div>

                <div className="flex p-1 bg-slate-900 border border-slate-800 rounded-xl">
                    <button
                        onClick={() => setActiveTab('users')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'users' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
                    >
                        <Users className="w-4 h-4" /> Users
                    </button>
                    <button
                        onClick={() => setActiveTab('invites')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'invites' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
                    >
                        <Link2 className="w-4 h-4" /> Invites
                    </button>
                    <button
                        onClick={() => setActiveTab('webhooks')}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activeTab === 'webhooks' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:text-white'}`}
                    >
                        <Webhook className="w-4 h-4" /> Webhooks
                    </button>
                </div>
            </div>

            {/* Server Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center gap-5 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-linear-to-br from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0 border border-indigo-500/20">
                        <Users className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase mb-1">Total Users</p>
                        <p className="text-3xl font-bold text-white">{serverStats?.total_users || 0}</p>
                    </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center gap-5 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-linear-to-br from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0 border border-emerald-500/20">
                        <Hash className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase mb-1">Total Channels</p>
                        <p className="text-3xl font-bold text-white">{serverStats?.total_channels || 0}</p>
                    </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center gap-5 relative overflow-hidden group">
                    <div className="absolute inset-0 bg-linear-to-br from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0 border border-purple-500/20">
                        <MessageCircle className="w-7 h-7" />
                    </div>
                    <div>
                        <p className="text-xs text-slate-400 font-semibold tracking-wider uppercase mb-1">Total Messages</p>
                        <p className="text-3xl font-bold text-white">{serverStats?.total_messages || 0}</p>
                    </div>
                </div>
            </div>

            {/* Tabbed Content Area */}
            <div className="mt-8 transition-all duration-300">
                {activeTab === 'users' && (
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="space-y-6"
                    >
                        {/* Registration Toggle Component */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                            <div className="p-5 flex items-center justify-between">
                                <div className="flex items-center gap-4 pl-2">
                                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                                        <UserPlus className="w-6 h-6" />
                                    </div>
                                    <div>
                                        <p className="text-base font-semibold text-white">Open Registration</p>
                                        <p className="text-sm text-slate-400">Allow anyone to register a new account on this server</p>
                                    </div>
                                </div>
                                <button
                                    onClick={handleToggleRegistration}
                                    className={`relative inline-flex h-7 w-12 overflow-hidden rounded-full transition-colors ease-in-out duration-200 focus:outline-none ${regSetting?.allow_registration ? 'bg-indigo-500' : 'bg-slate-700'}`}
                                >
                                    <span className={`inline-block h-7 w-7 transform rounded-full bg-white transition ease-in-out duration-200 shadow-sm ${regSetting?.allow_registration ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>
                            </div>
                        </div>

                        {/* Users List */}
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                            <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-950/50">
                                <h4 className="text-lg font-semibold text-white">User Directory</h4>
                                <div className="relative w-full sm:w-72">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                                    <input
                                        type="text"
                                        placeholder="Search users..."
                                        className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder-slate-500 outline-none transition-all"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="divide-y divide-slate-800/50 max-h-[500px] overflow-y-auto custom-scrollbar">
                                {filteredUsers.length === 0 ? (
                                    <div className="p-12 text-center text-slate-500">No users found.</div>
                                ) : (
                                    filteredUsers.map((u: AdminUser) => (
                                        <div key={u.id} className="flex items-center justify-between p-4 hover:bg-slate-800/20 transition-colors group">
                                            <div className="flex items-center gap-4">
                                                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-indigo-400 border border-slate-700">
                                                    {u.name.substring(0, 1).toUpperCase()}
                                                </div>
                                                <div className="flex flex-col">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-slate-200">{u.name}</span>
                                                        {u.is_admin && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-400 uppercase">Admin</span>}
                                                    </div>
                                                    <span className="text-xs text-slate-500">{u.email}</span>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                {u.is_banned && <span title="Banned"><Ban className="w-4 h-4 text-rose-500" /></span>}
                                                <div className="relative">
                                                    <button
                                                        onClick={() => setActiveDropdown(activeDropdown === u.id ? null : u.id)}
                                                        className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                                    >
                                                        <MoreVertical className="w-5 h-5" />
                                                    </button>
                                                    {activeDropdown === u.id && (
                                                        <div ref={dropdownRef} className="absolute right-0 top-full mt-2 w-48 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 py-1 overflow-hidden">
                                                            <button onClick={() => { setActiveDropdown(null); setResetPwModalData({ id: u.id, name: u.name }); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700 text-left transition-colors">
                                                                <KeyRound className="w-4 h-4" /> Reset Password
                                                            </button>
                                                            <button onClick={() => { toggleAdmin(u.id); setActiveDropdown(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700 text-left transition-colors">
                                                                <Shield className="w-4 h-4" /> {u.is_admin ? 'Remove Admin' : 'Make Admin'}
                                                            </button>
                                                            <button onClick={() => { toggleBan(u.id); setActiveDropdown(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-300 hover:text-white hover:bg-slate-700 text-left transition-colors">
                                                                <Ban className="w-4 h-4" /> {u.is_banned ? 'Unban User' : 'Ban User'}
                                                            </button>
                                                            <div className="h-px bg-slate-700 my-1" />
                                                            <button onClick={() => { if (confirm('Permanently delete user?')) deleteUser(u.id); setActiveDropdown(null); }} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-rose-400 hover:bg-rose-500/10 text-left transition-colors">
                                                                <UserX className="w-4 h-4" /> Delete User
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </motion.div>
                )}

                {activeTab === 'invites' && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        <AdminInvites />
                    </motion.div>
                )}

                {activeTab === 'webhooks' && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                        <AdminWebhooks />
                    </motion.div>
                )}
            </div>

            {/* Reset Password Modal */}
            <AnimatePresence>
                {resetPwModalData && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-slate-900 border border-slate-800 w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden p-6">
                            <h3 className="text-xl font-bold text-white mb-6">Reset Password for {resetPwModalData.name}</h3>
                            <input
                                type="password"
                                placeholder="New Password (min 6 chars)"
                                className="w-full bg-slate-950/50 border border-slate-800 rounded-xl py-2.5 px-4 text-white outline-none focus:border-indigo-500 mb-4 transition-all"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && submitResetPassword()}
                            />
                            {resetPwError && <p className="text-xs text-rose-500 mb-4">{resetPwError}</p>}
                            <div className="flex justify-end gap-3">
                                <button onClick={() => setResetPwModalData(null)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
                                <button onClick={submitResetPassword} disabled={isResetting || newPassword.length < 6} className="bg-indigo-600 hover:bg-indigo-500 px-6 py-2 rounded-xl text-white font-bold transition-all disabled:opacity-50">
                                    {isResetting ? 'Saving...' : 'Reset'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
