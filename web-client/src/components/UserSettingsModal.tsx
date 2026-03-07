import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Shield, LogOut, KeyRound } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../store';
import { logout, setCredentials } from '../store/slices/authSlice';
import { useUploadAvatarMutation } from '../store/api/filesApi';
import AdminPanel from './AdminPanel';

interface UserSettingsModalProps {
    onClose: () => void;
}

export default function UserSettingsModal({ onClose }: UserSettingsModalProps) {
    const dispatch = useDispatch();
    const user = useSelector((state: RootState) => state.auth.user);
    const token = useSelector((state: RootState) => state.auth.token);
    const [activeTab, setActiveTab] = useState<'profile' | 'admin'>('profile');

    const [uploadAvatar, { isLoading: isUploadingAvatar }] = useUploadAvatarMutation();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // 修改显示名
    const [newName, setNewName] = useState(user?.name ?? '');
    const [nameMsg, setNameMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [nameSaving, setNameSaving] = useState(false);

    // 修改密码
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null);
    const [pwSaving, setPwSaving] = useState(false);

    const handleLogout = () => {
        dispatch(logout());
        onClose();
    };

    const handleAvatarSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 2 * 1024 * 1024) {
                alert("头像大小不能超过 2MB");
                return;
            }
            try {
                await uploadAvatar(file).unwrap();
                alert("头像更新成功！正在刷新...");
                window.location.reload();
            } catch {
                alert("头像上传失败");
            }
        }
    };

    const handleSaveName = async () => {
        if (!user || !token || newName.trim() === user.name) return;
        setNameSaving(true);
        setNameMsg(null);
        try {
            const res = await fetch('/api/users/me', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ name: newName.trim() }),
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(errText || '更新失败，请重试');
            }
            dispatch(setCredentials({ user: { ...user, name: newName.trim() }, token }));
            setNameMsg({ text: '显示名已更新', ok: true });
            setTimeout(() => setNameMsg(null), 3000);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : '更新失败，请重试';
            setNameMsg({ text: msg, ok: false });
            setTimeout(() => setNameMsg(null), 3000);
        } finally {
            setNameSaving(false);
        }
    };

    const handleChangePassword = async () => {
        if (!token || !oldPassword || !newPassword || newPassword !== confirmPassword) return;
        setPwSaving(true);
        setPwMsg(null);
        try {
            const res = await fetch('/api/users/me/password', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
            });
            if (!res.ok) {
                const errText = await res.text().catch(() => '');
                throw new Error(errText || '当前密码错误或请求失败');
            }
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setPwMsg({ text: '密码已修改', ok: true });
            setTimeout(() => setPwMsg(null), 3000);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : '修改密码失败，请重试';
            setPwMsg({ text: msg, ok: false });
            setTimeout(() => setPwMsg(null), 3000);
        } finally {
            setPwSaving(false);
        }
    };

    const pwMismatch = newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword;
    const pwDisabled = pwSaving || !oldPassword || !newPassword || !confirmPassword || pwMismatch;

    if (!user) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop object to dismiss modal */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={onClose}
                    className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
                />

                <motion.div
                    initial={{ opacity: 0, scale: 0.95, y: 10 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 10 }}
                    className="relative bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-3xl h-[80vh] shadow-2xl overflow-hidden flex flex-col"
                >
                    {/* Header */}
                    <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 shrink-0 bg-slate-900">
                        <h2 className="text-lg font-bold text-white flex items-center gap-2">
                            设置
                        </h2>
                        <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors">
                            <X className="w-5 h-5" />
                        </button>
                    </header>

                    <div className="flex flex-1 overflow-hidden">
                        {/* Sidebar inside Modal */}
                        <div className="w-56 bg-slate-900/50 border-r border-slate-800 p-4 space-y-2 shrink-0">
                            <button
                                onClick={() => setActiveTab('profile')}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm ${activeTab === 'profile' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                    }`}
                            >
                                <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs overflow-hidden shrink-0">
                                    <img src={`/api/users/${user.id}/avatar?timestamp=${new Date().getTime()}`}
                                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                        className="w-full h-full object-cover"
                                        alt="Avatar" />
                                    <span className="absolute">{user.name.substring(0, 2).toUpperCase()}</span>
                                </div>
                                个人资料
                            </button>

                            {user.is_admin && (
                                <button
                                    onClick={() => setActiveTab('admin')}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium text-sm ${activeTab === 'admin' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                                        }`}
                                >
                                    <Shield className="w-5 h-5 shrink-0" />
                                    管理员
                                </button>
                            )}

                            <div className="pt-6 mt-6 border-t border-slate-800">
                                <button
                                    onClick={handleLogout}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-red-400 hover:bg-red-400/10 transition-colors font-medium text-sm"
                                >
                                    <LogOut className="w-5 h-5 shrink-0" />
                                    退出登录
                                </button>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div className="flex-1 overflow-y-auto bg-slate-950 p-8">
                            {activeTab === 'profile' && (
                                <div className="max-w-lg">
                                    <h3 className="text-xl font-bold text-white mb-6">用户资料</h3>

                                    {/* 头像区块 */}
                                    <div className="flex items-center gap-6 mb-8 bg-slate-900 p-6 rounded-2xl border border-slate-800">
                                        <div className="relative group shrink-0">
                                            <div className="w-24 h-24 rounded-full bg-slate-800 border-2 border-indigo-500/30 overflow-hidden flex items-center justify-center text-2xl font-bold text-slate-400 shadow-xl">
                                                <img src={`/api/users/${user.id}/avatar?timestamp=${new Date().getTime()}`}
                                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                                    className="absolute inset-0 w-full h-full object-cover z-10"
                                                    alt="Avatar" />
                                                <span className="z-0 relative">{user.name.substring(0, 2).toUpperCase()}</span>
                                            </div>
                                            <button
                                                onClick={() => fileInputRef.current?.click()}
                                                disabled={isUploadingAvatar}
                                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity z-20 flex flex-col items-center justify-center rounded-full text-white text-xs font-semibold backdrop-blur-sm cursor-pointer disabled:opacity-50"
                                            >
                                                <Upload className="w-5 h-5 mb-1" />
                                                {isUploadingAvatar ? '上传中...' : '更换'}
                                            </button>
                                            <input type="file" ref={fileInputRef} className="hidden" accept="image/png, image/jpeg, image/webp" onChange={handleAvatarSelect} />
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-2xl font-bold text-white truncate">{user.name}</h4>
                                            <p className="text-slate-400 text-sm mb-2">{user.email}</p>
                                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 text-green-400 text-xs font-medium border border-green-500/20">
                                                <KeyRound className="w-3.5 h-3.5" />
                                                端对端加密已启用
                                            </div>
                                        </div>
                                    </div>

                                    {/* 用户 ID */}
                                    <div className="space-y-4 mb-6">
                                        <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                                            <label className="block text-xs font-medium text-slate-500 uppercase tracking-wider mb-2">用户 ID</label>
                                            <div className="font-mono text-sm text-slate-300 break-all">{user.id}</div>
                                        </div>
                                    </div>

                                    {/* 修改显示名 */}
                                    <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 mb-4">
                                        <h4 className="text-sm font-semibold text-white mb-3">修改显示名</h4>
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={newName}
                                                onChange={(e) => setNewName(e.target.value)}
                                                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
                                                placeholder="新显示名"
                                            />
                                            <button
                                                onClick={handleSaveName}
                                                disabled={nameSaving || newName.trim() === user.name || !newName.trim()}
                                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                保存
                                            </button>
                                        </div>
                                        {nameMsg && (
                                            <p className={`text-xs mt-2 ${nameMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
                                                {nameMsg.text}
                                            </p>
                                        )}
                                    </div>

                                    {/* 修改密码 */}
                                    <div className="bg-slate-900 p-5 rounded-xl border border-slate-800">
                                        <h4 className="text-sm font-semibold text-white mb-3">修改密码</h4>
                                        <div className="space-y-2">
                                            <input
                                                type="password"
                                                value={oldPassword}
                                                onChange={(e) => setOldPassword(e.target.value)}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
                                                placeholder="当前密码"
                                            />
                                            <input
                                                type="password"
                                                value={newPassword}
                                                onChange={(e) => setNewPassword(e.target.value)}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition-colors"
                                                placeholder="新密码"
                                            />
                                            <input
                                                type="password"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                className={`w-full bg-slate-800 border rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 outline-none transition-colors ${pwMismatch ? 'border-red-500 focus:border-red-500' : 'border-slate-700 focus:border-indigo-500'}`}
                                                placeholder="确认新密码"
                                            />
                                            {pwMismatch && (
                                                <p className="text-xs text-red-400">两次密码输入不一致</p>
                                            )}
                                        </div>
                                        <button
                                            onClick={handleChangePassword}
                                            disabled={pwDisabled}
                                            className="mt-3 w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            修改密码
                                        </button>
                                        {pwMsg && (
                                            <p className={`text-xs mt-2 ${pwMsg.ok ? 'text-green-400' : 'text-red-400'}`}>
                                                {pwMsg.text}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {activeTab === 'admin' && user.is_admin && (
                                <AdminPanel />
                            )}
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
