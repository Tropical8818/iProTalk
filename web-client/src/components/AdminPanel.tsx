import { useState } from 'react';
import { useGetUsersQuery, useToggleBanMutation, useToggleAdminMutation, useDeleteUserMutation, useResetPasswordMutation, useGetRegistrationSettingQuery, useToggleRegistrationSettingMutation, useGetServerStatsQuery } from '../store/api/adminApi';
import { Shield, ShieldOff, Ban, UserX, KeyRound, Loader2, UserPlus, Users, Hash, MessageCircle } from 'lucide-react';

export default function AdminPanel() {
    const { data: users, isLoading, error } = useGetUsersQuery({});
    const { data: regSetting, refetch: refetchRegSetting } = useGetRegistrationSettingQuery();
    const { data: serverStats } = useGetServerStatsQuery();
    const [toggleBan] = useToggleBanMutation();
    const [toggleAdmin] = useToggleAdminMutation();
    const [deleteUser] = useDeleteUserMutation();
    const [resetPassword] = useResetPasswordMutation();
    const [toggleRegistration] = useToggleRegistrationSettingMutation();
    const [passwordInput, setPasswordInput] = useState<Record<string, string>>({});

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

    const handleResetPassword = async (uid: string) => {
        const pw = passwordInput[uid];
        if (!pw || pw.length < 6) {
            alert("Password must be at least 6 characters.");
            return;
        }
        if (confirm("Are you sure you want to forcibly reset this user's password?")) {
            try {
                await resetPassword({ uid, new_password: pw }).unwrap();
                alert("Password reset successfully.");
                setPasswordInput({ ...passwordInput, [uid]: '' });
            } catch {
                alert("Failed to reset password.");
            }
        }
    };

    return (
        <div>
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-500/20 rounded-lg text-indigo-400">
                    <Shield className="w-6 h-6" />
                </div>
                <div>
                    <h3 className="text-xl font-bold text-white">System Administration</h3>
                    <p className="text-sm text-slate-400">Manage all users across the workspace</p>
                </div>
            </div>

            {/* Server Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 shrink-0">
                        <Users className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400 font-medium tracking-wide uppercase">Total Users</p>
                        <p className="text-2xl font-bold text-white">{serverStats?.total_users || 0}</p>
                    </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 shrink-0">
                        <Hash className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400 font-medium tracking-wide uppercase">Total Channels</p>
                        <p className="text-2xl font-bold text-white">{serverStats?.total_channels || 0}</p>
                    </div>
                </div>
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 shrink-0">
                        <MessageCircle className="w-6 h-6" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-400 font-medium tracking-wide uppercase">Total Messages</p>
                        <p className="text-2xl font-bold text-white">{serverStats?.total_messages || 0}</p>
                    </div>
                </div>
            </div>

            <div className="mb-6 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden p-1">
                <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                            <UserPlus className="w-5 h-5" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-white">Open Registration</p>
                            <p className="text-xs text-slate-400">Allow anyone to register a new account on this server</p>
                        </div>
                    </div>
                    <button
                        onClick={handleToggleRegistration}
                        className={`relative inline-flex h-6 w-10 overflow-hidden rounded-full transition-colors ease-in-out duration-200 focus:outline-none ${regSetting?.allow_registration ? 'bg-indigo-500' : 'bg-slate-600'}`}
                        title={regSetting?.allow_registration ? "Disable Registration" : "Enable Registration"}
                    >
                        <span className={`inline-block h-6 w-6 transform rounded-full bg-white transition ease-in-out duration-200 ${regSetting?.allow_registration ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-slate-900/50 border-b border-slate-800 text-slate-400">
                            <tr>
                                <th className="px-6 py-4 font-medium max-w-[200px]">User</th>
                                <th className="px-6 py-4 font-medium">Status</th>
                                <th className="px-6 py-4 font-medium text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/50">
                            {users?.map((u: { id: string; name: string; email: string; is_admin: boolean; is_banned: boolean; }) => (
                                <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                                    <td className="px-6 py-4 min-w-[200px]">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-slate-800 overflow-hidden shrink-0 flex items-center justify-center font-bold text-slate-400 relative">
                                                <img src={`/api/users/${u.id}/avatar?timestamp=${new Date().getTime()}`}
                                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                    className="absolute inset-0 w-full h-full object-cover z-10" />
                                                <span className="z-0 relative">{u.name.substring(0, 2).toUpperCase()}</span>
                                            </div>
                                            <div className="flex flex-col truncate">
                                                <span className="font-semibold text-slate-200">{u.name}</span>
                                                <span className="text-xs text-slate-500 truncate max-w-[150px]">{u.email}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex gap-2">
                                            {u.is_admin ? (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-500/10 text-indigo-400 text-xs font-semibold border border-indigo-500/20"><Shield className="w-3 h-3" /> Admin</span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-800 text-slate-400 text-xs font-semibold"><ShieldOff className="w-3 h-3" /> User</span>
                                            )}
                                            {u.is_banned && (
                                                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-500/10 text-red-400 text-xs font-semibold border border-red-500/20"><Ban className="w-3 h-3" /> Banned</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <div className="flex items-center justify-end gap-2">

                                            <div className="flex items-center bg-slate-950 border border-slate-700 rounded-lg overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 ring-indigo-500 transition-all mr-2">
                                                <input
                                                    type="password"
                                                    placeholder="New password"
                                                    className="bg-transparent text-white px-3 py-1.5 w-32 text-xs outline-none"
                                                    value={passwordInput[u.id] || ''}
                                                    onChange={(e) => setPasswordInput({ ...passwordInput, [u.id]: e.target.value })}
                                                />
                                                <button onClick={() => handleResetPassword(u.id)} className="px-2 py-1.5 text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors" title="Reset Password">
                                                    <KeyRound className="w-4 h-4" />
                                                </button>
                                            </div>

                                            <button
                                                onClick={async () => {
                                                    if (confirm(`Change admin status for ${u.name}?`)) await toggleAdmin(u.id);
                                                }}
                                                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors border border-slate-700" title="Toggle Admin">
                                                {u.is_admin ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                                            </button>

                                            <button
                                                onClick={async () => {
                                                    if (confirm(`Change ban status for ${u.name}?`)) await toggleBan(u.id);
                                                }}
                                                className={`p-2 rounded-lg transition-colors border border-slate-700 ${u.is_banned ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'}`} title={u.is_banned ? "Unban User" : "Ban User"}>
                                                <Ban className="w-4 h-4" />
                                            </button>

                                            <button
                                                onClick={async () => {
                                                    if (confirm(`PERMANENTLY DELETE ${u.name}? This cannot be undone.`)) await deleteUser(u.id);
                                                }}
                                                className="p-2 bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-300 rounded-lg transition-colors border border-slate-700" title="Delete User">
                                                <UserX className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
