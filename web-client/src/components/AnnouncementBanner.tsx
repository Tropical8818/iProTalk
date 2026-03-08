import { X, Megaphone } from 'lucide-react';
import { useState } from 'react';

interface AnnouncementBannerProps {
    text: string;
    onDismiss?: () => void;
}

export default function AnnouncementBanner({ text, onDismiss }: AnnouncementBannerProps) {
    const [visible, setVisible] = useState(true);

    if (!text || !visible) return null;

    return (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border-b border-amber-500/20">
            <Megaphone size={16} className="text-amber-400 shrink-0" />
            <p className="flex-1 text-sm text-amber-200/90 truncate">{text}</p>
            <button
                onClick={() => { setVisible(false); onDismiss?.(); }}
                className="text-amber-400/60 hover:text-amber-300 transition-colors shrink-0"
            >
                <X size={14} />
            </button>
        </div>
    );
}
