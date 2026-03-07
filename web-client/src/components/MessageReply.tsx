interface ReplyInfo {
    id: string
    sender: string
    text: string
}

interface MessageReplyProps {
    reply: ReplyInfo
}

export default function MessageReply({ reply }: MessageReplyProps) {
    const preview = reply.text.length > 50 ? reply.text.slice(0, 50) + '…' : reply.text

    return (
        <div className="flex items-start gap-1.5 px-3 py-1.5 mb-1 rounded-t-xl bg-slate-700/50 border-l-2 border-indigo-500 text-xs text-slate-400 max-w-[75%]">
            <span className="font-semibold text-indigo-400 shrink-0">{reply.sender}</span>
            <span className="truncate">{preview}</span>
        </div>
    )
}

export type { ReplyInfo }
