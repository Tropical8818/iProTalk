import { useState, useRef, useEffect, useMemo } from 'react';
import { useGetUsersQuery, useToggleBanMutation, useToggleAdminMutation, useDeleteUserMutation, useResetPasswordMutation, useGetRegistrationSettingQuery, useToggleRegistrationSettingMutation, useGetServerStatsQuery } from '../store/api/adminApi';
import { Shield, ShieldOff, Ban, UserX, KeyRound, Loader2, UserPlus, Users, Hash, MessageCircle, Search, MoreVertical, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface AdminUser {
    id: string;
    name: string;
    email: string;
    is_admin: boolean;
    is_banned: boolean;
}

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
        } catch (err: any) {
            setResetPwError(err?.data?.message || err?.data || "Failed to reset password.");
        } finally {
            setIsResetting(false);
        }
    };

    return (
        <div>
            <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
                        <Shield className="w-6 h-6" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-bold text-white tracking-tight">System Administration</h3>
                        <p className="text-slate-400">Manage all users, settings, and workspace metrics</p>
                    </div>
                </div>
            </div>

            {/* Server Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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

            <div className="mb-8 bg-slate-900 border border-slate-800 rounded-2xl relative overflow-hidden">
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
                        title={regSetting?.allow_registration ? "Disable Registration" : "Enable Registration"}
                    >
                        <span className={`inline-block h-7 w-7 transform rounded-full bg-white transition ease-in-out duration-200 shadow-sm ${regSetting?.allow_registration ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>

            {/* Users List Section */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
                <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-950/50">
                    <h4 className="text-lg font-semibold text-white">Directory Overview</h4>
                    <div className="relative w-full sm:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                        <input
                            type="text"
                            placeholder="Search users..."
                            className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-2 pl-9 pr-4 text-sm text-white placeholder-slate-500 outline-none transition-all"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                        />
                    </div>
                </div>

                <div className="divide-y divide-slate-800/50 max-h-[600px] overflow-y-auto">
                    {filteredUsers.length === 0 ? (
                        <div className="p-12 text-center text-slate-500">
                            No users found matching your search.
                        </div>
                    ) : (
                        filteredUsers.map((u: AdminUser) => (
                            <div key={u.id} className="flex items-center justify-between p-4 hover:bg-slate-800/20 transition-colors group">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-full bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center font-bold text-slate-400 relative border border-slate-700">
                                        <img src={`/api/users/${u.id}/avatar?timestamp=${new Date().getTime()}`}
                                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                            className="absolute inset-0 w-full h-full object-cover z-10" />
                                        <span className="z-0 relative">{u.name.substring(0, 2).toUpperCase()}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-slate-200">{u.name}</span>
                                            {u.is_admin && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-400 uppercase tracking-wider">Admin</span>
                                            )}
                                        </div>
                                        <span className="text-sm text-slate-500">{u.email}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4">
                                    {u.is_banned && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-500/10 text-red-400 text-xs font-semibold border border-red-500/20">
                                            <Ban className="w-3.5 h-3.5" /> Banned
                                        </span>
                                    )}

                                    <div className="relative">
                                        <button
                                            onClick={() => setActiveDropdown(activeDropdown === u.id ? null : u.id)}
                                            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                                        >
                                            <MoreVertical className="w-5 h-5" />
                                        </button>

                                        <AnimatePresence>
                                            {activeDropdown === u.id && (
                                                <motion.div
                                                    initial={{ opacity: 0, scale: 0.95, y: -10 }}
                                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                                    exit={{ opacity: 0, scale: 0.95, y: -10 }}
                                                    transition={{ duration: 0.15 }}
                                                    ref={dropdownRef}
                                                    className="absolute right-0 top-full mt-2 w-56 bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-20 overflow-hidden"
                                                >
                                                    <div className="p-1">
                                                        <button
                                                            onClick={() => { setActiveDropdown(null); setResetPwModalData({ id: u.id, name: u.name }); }}
                                                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors text-left"
                                                        >
                                                            <KeyRound className="w-4 h-4 text-emerald-400" /> Reset Password
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                if (confirm(`Change admin status for ${u.name}?`)) {
                                                                    await toggleAdmin(u.id);
                                                                    setActiveDropdown(null);
                                                                }
                                                            }}
                                                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors text-left"
                                                        >
                                                            {u.is_admin ? <><ShieldOff className="w-4 h-4 text-orange-400" /> Remove Admin</> : <><Shield className="w-4 h-4 text-indigo-400" /> Make Admin</>}
                                                        </button>
                                                        <div className="h-px bg-slate-700 my-1 font-bold" />
                                                        <button
                                                            onClick={async () => {
                                                                if (confirm(`Change ban status for ${u.name}?`)) {
                                                                    await toggleBan(u.id);
                                                                    setActiveDropdown(null);
                                                                }
                                                            }}
                                                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors text-left"
                                                        >
                                                            <Ban className="w-4 h-4 text-red-400" /> {u.is_banned ? 'Unban User' : 'Ban User'}
                                                        </button>
                                                        <button
                                                            onClick={async () => {
                                                                if (confirm(`PERMANENTLY DELETE ${u.name}? This cannot be undone.`)) {
                                                                    await deleteUser(u.id);
                                                                    setActiveDropdown(null);
                                                                }
                                                            }}
                                                            className="w-full flex items-center gap-3 px-3 py-2 text-sm text-red-400 hover:bg-red-500/20 rounded-lg transition-colors text-left"
                                                        >
                                                            <UserX className="w-4 h-4" /> Delete Account
                                                        </button>
                                                    </div>
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Reset Password Modal */}
            <AnimatePresence>
                {resetPwModalData && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
                            onClick={() => !isResetting && setResetPwModalData(null)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="relative w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
                        >
                            <div className="p-6">
                                <div className="flex items-center justify-between mb-6">
                                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                        <KeyRound className="w-5 h-5 text-emerald-400" />
                                        Reset Password
                                    </h3>
                                    <button
                                        onClick={() => setResetPwModalData(null)}
                                        disabled={isResetting}
                                        className="p-1 text-slate-500 hover:text-white rounded-md hover:bg-slate-800 transition-colors disabled:opacity-50"
                                    >
                                        <X className="w-5 h-5" />
                                    </button>
                                </div>

                                <p className="text-sm text-slate-400 mb-6">
                                    Enter a new master password for <span className="font-semibold text-slate-200">{resetPwModalData.name}</span>. They will be logged out of all active sessions.
                                </p>

                                {resetPwError && (
                                    <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
                                        {resetPwError}
                                    </div>
                                )}

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-medium text-slate-400 mb-1.5 uppercase tracking-wider">New Password</label>
                                        <input
                                            type="password"
                                            autoFocus
                                            placeholder="Min 6 characters"
                                            className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl py-2.5 px-3 text-white placeholder-slate-600 outline-none transition-all"
                                            value={newPassword}
                                            onChange={(e) => setNewPassword(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && submitResetPassword()}
                                        />
                                    </div>
                                    <button
                                        onClick={submitResetPassword}
                                        disabled={isResetting || newPassword.length < 6}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {isResetting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm Reset'}
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
