import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'

interface ImagePreviewModalProps {
    src: string
    alt?: string
    onClose: () => void
}

export default function ImagePreviewModal({ src, alt = '图片', onClose }: ImagePreviewModalProps) {
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose()
        }
        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [onClose])

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
            onClick={onClose}
        >
            <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 text-white/70 hover:text-white bg-slate-800/60 rounded-full transition-colors z-10"
                title="关闭"
            >
                <X className="w-6 h-6" />
            </button>
            <motion.img
                initial={{ scale: 0.92 }}
                animate={{ scale: 1 }}
                src={src}
                alt={alt}
                className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            />
        </motion.div>
    )
}
