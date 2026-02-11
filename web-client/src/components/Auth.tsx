import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, Lock, ArrowRight, Github, AlertCircle, Mail } from 'lucide-react'
import { authApi } from '../api'

interface AuthProps {
    onSuccess: (data: { token: string; user_id: string; name: string }) => void
}

export const Auth = ({ onSuccess }: AuthProps) => {
    const [isLogin, setIsLogin] = useState(true)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')
    const [formData, setFormData] = useState({
        email: '',
        name: '',
        password: '',
    })

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setLoading(true)
        setError('')

        try {
            const response = isLogin
                ? await authApi.login(formData)
                : await authApi.register(formData)

            // Pass the full data object which includes token, user_id, and name
            onSuccess(response.data)
        } catch (err: any) {
            console.error("Auth error:", err)
            // Poem can return plain text errors or JSON
            const serverMsg = err.response?.data?.message || err.response?.data
            setError(typeof serverMsg === 'string' ? serverMsg : 'Authentication failed. Please check your credentials.')
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
                        {isLogin ? 'Welcome Back' : 'Create Account'}
                    </h2>
                    <p className="text-slate-400 mt-2">
                        {isLogin ? 'Enter your details to sign in' : 'Join iProTalk secure messaging'}
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
                            <label className="block text-sm font-medium text-slate-300 mb-1.5 ml-1">Full Name</label>
                            <div className="relative group">
                                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500 group-focus-within:text-indigo-500 transition-colors" />
                                <input
                                    type="text"
                                    required={!isLogin}
                                    className="w-full bg-slate-950/50 border border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 rounded-xl py-3 pl-11 pr-4 text-white placeholder-slate-600 outline-none transition-all"
                                    placeholder="John Doe"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                />
                            </div>
                        </motion.div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-300 mb-1.5 ml-1">Email Address</label>
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
                        <label className="block text-sm font-medium text-slate-300 mb-1.5 ml-1">Password</label>
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
                                <span>{isLogin ? 'Sign In' : 'Get Started'}</span>
                                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 pt-6 border-t border-slate-800 text-center">
                    <p className="text-slate-400">
                        {isLogin ? "Don't have an account?" : "Already have an account?"}
                        <button
                            onClick={() => setIsLogin(!isLogin)}
                            className="ml-2 text-indigo-400 font-medium hover:text-indigo-300 underline-offset-4 hover:underline transition-colors"
                        >
                            {isLogin ? 'Sign Up' : 'Log In'}
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
