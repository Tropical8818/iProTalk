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
            if (!token) throw new Error("Not authenticated. Please log in again.");
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
                throw new Error(`Failed to upload keys (${res.status}): ${errText}`);
            }

            setSuccess(true);
            dispatch(updateE2EEStatus(true));
            setTimeout(() => {
                navigate("/");
            }, 1500);

        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message || "An unexpected error occurred.");
            } else {
                setError("An unexpected error occurred.");
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
                    {success ? "Encryption Secured" : "Secure Your Chats"}
                </h2>

                <p className="text-slate-600 dark:text-slate-300 text-center mb-8 font-medium">
                    iProTalk uses <b>End-to-End Encryption</b> to keep your messages private. Only you and the people you message can read them.
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
                            <><Loader2 className="w-5 h-5 animate-spin" /> Generating Keys...</>
                        ) : success ? (
                            <><ShieldCheck className="w-5 h-5" /> Secured</>
                        ) : (
                            <><KeyRound className="w-5 h-5" /> Initialize E2EE Keys</>
                        )}
                    </button>
                </div>

                <p className="text-xs text-center text-slate-500 mt-6 mt-4">
                    Your private keys never leave your device.
                </p>
            </div>
        </div>
    );
}
