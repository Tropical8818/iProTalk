interface Reaction {
    emoji: string
    count: number
    isMine: boolean
}

interface MessageReactionProps {
    reactions: Reaction[]
    onToggle: (emoji: string) => void
}

export default function MessageReaction({ reactions, onToggle }: MessageReactionProps) {
    if (!reactions.length) return null

    return (
        <div className="flex flex-wrap gap-1 mt-1">
            {reactions.map(({ emoji, count, isMine }) => (
                <button
                    key={emoji}
                    onClick={() => onToggle(emoji)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium transition-colors border ${
                        isMine
                            ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300 hover:bg-indigo-600/50'
                            : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700'
                    }`}
                    title={isMine ? '点击取消' : '点击添加'}
                >
                    <span>{emoji}</span>
                    <span>{count}</span>
                </button>
            ))}
        </div>
    )
}

export type { Reaction }
