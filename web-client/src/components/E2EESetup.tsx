import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../store";
import { updateE2EEStatus } from "../store/slices/authSlice";
import { Lock, Loader2, KeyRound, ShieldCheck } from "lucide-react";
import { exportPublicKey, generateKeyPair, exportPrivateKey } from "../lib/crypto";

export default function E2EESetup() {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    const storeToken = useSelector((state: RootState) => state.auth.token);
    const token = storeToken || localStorage.getItem('token');
    const e2eeInitialized = useSelector((state: RootState) => state.auth.user?.e2ee_initialized);

    useEffect(() => {
        if (e2eeInitialized) {
            navigate("/");
        }
    }, [e2eeInitialized, navigate]);

    const handleSetup = async () => {
        setLoading(true);
        setError(null);
        try {
            // 1. Generate keys
            const keyPair = await generateKeyPair();

            // 2. Export public key to base64
            const b64PublicKey = await exportPublicKey(keyPair.publicKey);

            // 3. Keep private key in localStorage
            const b64PrivateKey = await exportPrivateKey(keyPair.privateKey);
            localStorage.setItem("e2ee_private_key", b64PrivateKey);
            localStorage.setItem("e2ee_public_key", b64PublicKey);

            // 4. Upload public key to API
            if (!token) throw new Error("未登录，请重新登录。");
            const res = await fetch("/api/users/keys", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ public_key: b64PublicKey })
            });

            if (!res.ok) {
                const errText = await res.text().catch(() => `HTTP ${res.status}`);
                throw new Error(`上传密钥失败 (${res.status}): ${errText}`);
            }

            setSuccess(true);
            dispatch(updateE2EEStatus(true));
            setTimeout(() => {
                navigate("/");
            }, 1500);

        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message || "发生了意外错误，请重试。");
            } else {
                setError("发生了意外错误，请重试。");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center flex-1 w-full h-full min-h-screen bg-slate-50 dark:bg-slate-900 p-4">
            <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 border border-slate-100 dark:border-slate-700">

                <div className="flex justify-center mb-6">
                    <div className="bg-indigo-100 dark:bg-indigo-900/40 p-4 rounded-full">
                        {success ? (
                            <ShieldCheck className="w-8 h-8 text-green-600 dark:text-green-400" />
                        ) : (
                            <Lock className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                        )}
                    </div>
                </div>

                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-500 to-purple-600 mb-2 text-center">
                    {success ? "加密已就绪" : "加密您的聊天"}
                </h2>

                <p className="text-slate-600 dark:text-slate-300 text-center mb-8 font-medium">
                    iProTalk 使用<b>端对端加密</b>保护您的消息安全。只有您和您的通话对象才能读取消息内容。
                </p>

                {error && (
                    <div className="mb-6 bg-red-50 text-red-600 p-3 rounded-lg border border-red-100 text-sm">
                        {error}
                    </div>
                )}

                <div className="space-y-4">
                    <button
                        onClick={handleSetup}
                        disabled={loading || success}
                        className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold text-white transition-all 
            ${success
                                ? "bg-green-500 cursor-default"
                                : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"}`}
                    >
                        {loading ? (
                            <><Loader2 className="w-5 h-5 animate-spin" /> 正在生成密钥...</>
                        ) : success ? (
                            <><ShieldCheck className="w-5 h-5" /> 已加密</>
                        ) : (
                            <><KeyRound className="w-5 h-5" /> 初始化加密密钥</>
                        )}
                    </button>
                </div>

                <p className="text-xs text-center text-slate-500 mt-6 mt-4">
                    您的私钥永远不会离开您的设备。
                </p>
            </div>
        </div>
    );
}
