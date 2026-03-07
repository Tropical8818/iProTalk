import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Lock, ArrowRight, Github, AlertCircle, Mail } from 'lucide-react'
import { useLoginMutation, useRegisterMutation } from '../store/api/authApi'
import { useDispatch } from 'react-redux'
import { setCredentials } from '../store/slices/authSlice'

export const Auth = () => {
    const [isLogin, setIsLogin] = useState(true)
    const dispatch = useDispatch()
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [formData, setFormData] = useState({
        email: '',
        name: '',
        password: '',
    })

    const [loginMutation] = useLoginMutation()
    const [registerMutation] = useRegisterMutation()

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            const data = await (isLogin ? loginMutation(formData) : registerMutation(formData)).unwrap()

            dispatch(setCredentials({
                user: {
                    id: data.user_id,
                    name: data.name,
                    email: formData.email,
                    e2ee_initialized: data.e2ee_initialized,
                    is_admin: data.is_admin,
                    is_banned: false,
                },
                token: data.token
            }))
        } catch (err: unknown) {
            console.error("Auth error:", err)
            // RTK Query unwraps the error into err.data for 400/500 requests automatically
            const error = err as { data?: string | { message?: string } };
            const serverMsg = typeof error.data === 'string' ? error.data : error.data?.message;
            setError(serverMsg || '登录失败，请检查您的账号和密码')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="flex flex-col items-center justify-center p-6 sm:p-12 w-full max-w-md">
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
            >
                {/* Background glow */}
                <div className="absolute top-0 left-0 w-full h-1 bg-linear-to-r from-indigo-500 via-purple-500 to-pink-500" />

                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-500/10 rounded-2xl mb-4 border border-indigo-500/20">
                        <User className="text-indigo-500 w-8 h-8" />
                    </div>
                    <h2 className="text-3xl font-bold text-white tracking-tight">
                        {isLogin ? '欢迎回来' : '创建账号'}
                    </h2>
                    <p className="text-slate-400 mt-2">
                        {isLogin ? '输入您的账号信息登录' : '加入 iProTalk 安全通讯'}
                    </p>
                </div>

                <AnimatePresence>
                    {error && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-sm overflow-hidden"
                        >
                            <AlertCircle className="w-4 h-4 shrink-0" />
                            <span>{error}</span>
                        </motion.div>
                    )}
                </AnimatePresence>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {!isLogin && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                        >
                            <label className="block text-sm font-medium text-slate-300 mb-1.5 ml-1">用户名</label>
                            <div className="relative group">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
                                <input
                                    type="text"
                                    required={!isLogin}
                                    className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl py-3 pl-11 pr-4 text-white placeholder-slate-600 outline-none transition-all"
                                    placeholder="张三"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                        </motion.div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5 ml-1">邮箱地址</label>
                        <div className="relative group">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
                            <input
                                type="email"
                                required
                                className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl py-3 pl-11 pr-4 text-white placeholder-slate-600 outline-none transition-all"
                                placeholder="john@example.com"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5 ml-1">密码</label>
                        <div className="relative group">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
                            <input
                                type="password"
                                required
                                className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl py-3 pl-11 pr-4 text-white placeholder-slate-600 outline-none transition-all"
                                placeholder="••••••••"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 group transition-all disabled:opacity-50 mt-6"
                    >
                        {loading ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <span>{isLogin ? '登录' : '开始使用'}</span>
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-slate-800 text-center">
                    <p className="text-slate-400">
                        {isLogin ? '还没有账号？' : '已有账号？'}
                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            className="ml-2 text-indigo-400 font-medium hover:text-indigo-300 underline-offset-4 hover:underline transition-colors"
                        >
                            {isLogin ? '立即注册' : '去登录'}
                        </button>
                    </p>
                </div>
            </motion.div>

            <div className="mt-8 flex items-center gap-6 text-slate-500">
                <a href="https://github.com/Tropical8818/iProTalk" target="_blank" className="flex items-center gap-2 hover:text-slate-300 transition-colors">
                    <Github className="w-5 h-5" />
                    <span className="text-sm">Source Code</span>
                </a>
            </div>
        </div>
    )
}
