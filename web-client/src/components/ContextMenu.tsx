import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Edit2, Reply, Forward, Pin, PinOff, Trash2 } from 'lucide-react';

export interface ContextMenuAction {
    label: string;
    icon: React.ReactNode;
    onClick: () => void;
    danger?: boolean;
    hidden?: boolean;
}

interface ContextMenuProps {
    x: number;
    y: number;
    visible: boolean;
    isPinned?: boolean;
    isMine?: boolean;
    onClose: () => void;
    onEdit?: () => void;
    onReply?: () => void;
    onForward?: () => void;
    onPin?: () => void;
    onUnpin?: () => void;
    onDelete?: () => void;
}

export default function ContextMenu({
    x, y, visible,
    isPinned, isMine,
    onClose, onEdit, onReply, onForward, onPin, onUnpin, onDelete,
}: ContextMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handle = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        if (visible) window.addEventListener('mousedown', handle);
        return () => window.removeEventListener('mousedown', handle);
    }, [visible, onClose]);

    // Adjust position to stay in viewport
    const safeX = Math.min(x, window.innerWidth - 210);
    const safeY = Math.min(y, window.innerHeight - 280);

    const items: ContextMenuAction[] = [
        { label: '回复', icon: <Reply size={14} />, onClick: () => { onReply?.(); onClose(); }, hidden: !onReply },
        { label: '编辑', icon: <Edit2 size={14} />, onClick: () => { onEdit?.(); onClose(); }, hidden: !isMine || !onEdit },
        { label: '转发', icon: <Forward size={14} />, onClick: () => { onForward?.(); onClose(); }, hidden: !onForward },
        { label: isPinned ? '取消置顶' : '置顶', icon: isPinned ? <PinOff size={14} /> : <Pin size={14} />, onClick: () => { if (isPinned) { onUnpin?.(); } else { onPin?.(); } onClose(); } },
        { label: '删除', icon: <Trash2 size={14} />, onClick: () => { onDelete?.(); onClose(); }, danger: true, hidden: !isMine || !onDelete },
    ].filter(i => !i.hidden) as ContextMenuAction[];

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    ref={menuRef}
                    initial={{ opacity: 0, scale: 0.92, y: -6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: -6 }}
                    transition={{ duration: 0.12 }}
                    style={{ top: safeY, left: safeX, position: 'fixed' }}
                    className="z-50 min-w-[180px] rounded-xl overflow-hidden shadow-2xl border border-slate-700 bg-slate-900/95 backdrop-blur-md"
                >
                    {items.map((item) => (
                        <button
                            key={item.label}
                            onClick={item.onClick}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors
                                ${item.danger
                                    ? 'text-red-400 hover:bg-red-500/10'
                                    : 'text-slate-200 hover:bg-slate-700/60'
                                }`}
                        >
                            <span className="shrink-0 opacity-70">{item.icon}</span>
                            {item.label}
                        </button>
                    ))}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
