import { motion, AnimatePresence } from 'framer-motion'

const EMOJIS = ['👍', '👎', '😄', '😂', '❤️', '🎉', '🔥', '😮']

interface EmojiPickerProps {
    onSelect: (emoji: string) => void
    onClose: () => void
}

export default function EmojiPicker({ onSelect, onClose }: EmojiPickerProps) {
    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 4 }}
                className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 shadow-xl z-20"
                onMouseLeave={onClose}
            >
                {EMOJIS.map((emoji) => (
                    <button
                        key={emoji}
                        onClick={() => { onSelect(emoji); onClose() }}
                        className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-slate-700 transition-colors"
                        title={emoji}
                    >
                        {emoji}
                    </button>
                ))}
            </motion.div>
        </AnimatePresence>
    )
}
