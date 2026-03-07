import { useState } from 'react'
import ImagePreviewModal from './ImagePreviewModal'

interface ImagePreviewProps {
    src: string
    alt?: string
}

export default function ImagePreview({ src, alt = '图片' }: ImagePreviewProps) {
    const [open, setOpen] = useState(false)

    return (
        <>
            <button
                className="block mt-1 rounded-xl overflow-hidden border border-slate-700 hover:border-indigo-500/50 transition-colors focus:outline-none"
                onClick={() => setOpen(true)}
                title="点击查看大图"
            >
                <img
                    src={src}
                    alt={alt}
                    className="max-w-[300px] max-h-48 object-cover rounded-xl"
                    loading="lazy"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
            </button>
            {open && <ImagePreviewModal src={src} alt={alt} onClose={() => setOpen(false)} />}
        </>
    )
}
