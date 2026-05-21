import React, { useMemo } from 'react'
import { X, MessageSquare, Reply } from 'lucide-react'
import { motion } from 'framer-motion'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Message } from './Chat'
import FileMessage from './FileMessage'

interface ThreadSidebarProps {
    rootMessage: Message
    replies: Message[]
    onClose: () => void
    onJumpToMessage?: (id: string) => void
}

const FILE_PATTERN = /^\[FILE:(.*?)\]\((.*?)\)$/

const ThreadSidebar: React.FC<ThreadSidebarProps> = ({
    rootMessage,
    replies,
    onClose,
    onJumpToMessage
}) => {
    const sortedReplies = useMemo(() => {
        return [...replies].sort((a, b) => a.timestamp - b.timestamp)
    }, [replies])

    return (
        <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            className="w-96 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col h-full shadow-xl"
        >
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2">
                    <MessageSquare size={18} className="text-indigo-500" />
                    <h3 className="font-semibold text-slate-800 dark:text-slate-200">消息详情</h3>
                </div>
                <button
                    onClick={onClose}
                    className="p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors"
                >
                    <X size={20} className="text-slate-500" />
                </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-6 custom-scrollbar">
                {/* Root Message */}
                <div className="bg-slate-50 dark:bg-slate-800/30 p-3 rounded-lg border border-slate-200 dark:border-slate-800 relative group">
                    <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-sm text-indigo-600 dark:text-indigo-400">
                            {rootMessage.sender}
                        </span>
                        <span className="text-[10px] text-slate-400">{rootMessage.time}</span>
                    </div>

                    <div className="text-sm text-slate-700 dark:text-slate-300 break-words prose dark:prose-invert prose-sm max-w-none">
                        {(() => {
                            const fileMatch = rootMessage.text.match(FILE_PATTERN)
                            if (fileMatch) {
                                return <FileMessage fileName={fileMatch[1]} fileUrl={fileMatch[2]} />
                            }
                            return (
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {rootMessage.text}
                                </ReactMarkdown>
                            )
                        })()}
                    </div>

                    <button
                        onClick={() => onJumpToMessage?.(rootMessage.id)}
                        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 rounded text-indigo-500 transition-all text-[10px] flex items-center gap-1"
                    >
                        定位
                    </button>
                </div>

                {/* Divider/Label */}
                <div className="flex items-center gap-3">
                    <div className="h-[1px] flex-1 bg-slate-200 dark:bg-slate-800"></div>
                    <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                        回复 ({replies.length})
                    </span>
                    <div className="h-[1px] flex-1 bg-slate-200 dark:bg-slate-800"></div>
                </div>

                {/* Replies List */}
                <div className="space-y-4">
                    {sortedReplies.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-8 text-slate-400 space-y-2">
                            <Reply size={32} className="opacity-20" />
                            <p className="text-xs">暂无回复</p>
                        </div>
                    ) : (
                        sortedReplies.map(reply => (
                            <div key={reply.id} className="group relative">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-xs text-slate-600 dark:text-slate-400">
                                        {reply.sender}
                                    </span>
                                    <span className="text-[10px] text-slate-400">{reply.time}</span>
                                </div>
                                <div className="text-sm text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 p-2 rounded border border-slate-100 dark:border-slate-800 shadow-sm">
                                    {(() => {
                                        const fileMatch = reply.text.match(FILE_PATTERN)
                                        if (fileMatch) {
                                            return <FileMessage fileName={fileMatch[1]} fileUrl={fileMatch[2]} />
                                        }
                                        return (
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {reply.text}
                                            </ReactMarkdown>
                                        )
                                    })()}
                                </div>
                                <button
                                    onClick={() => onJumpToMessage?.(reply.id)}
                                    className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 p-1 text-indigo-500 hover:underline text-[10px]"
                                >
                                    查看
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* Tip */}
            <div className="p-4 text-center border-t border-slate-200 dark:border-slate-800">
                <p className="text-[10px] text-slate-400 italic">
                    在此视图下发送的消息将自动关联至当前话题
                </p>
            </div>
        </motion.div>
    )
}

export default ThreadSidebar
