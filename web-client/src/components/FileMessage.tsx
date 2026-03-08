import { FileText, Image, Film, Music, Archive, Download } from 'lucide-react';

interface FileMessageProps {
    fileName: string;
    fileUrl: string;
    fileSize?: string;
}

const FILE_ICON_MAP: Record<string, React.ReactNode> = {
    pdf: <FileText size={20} className="text-red-400" />,
    doc: <FileText size={20} className="text-blue-400" />,
    docx: <FileText size={20} className="text-blue-400" />,
    xls: <FileText size={20} className="text-green-400" />,
    xlsx: <FileText size={20} className="text-green-400" />,
    ppt: <FileText size={20} className="text-orange-400" />,
    pptx: <FileText size={20} className="text-orange-400" />,
    png: <Image size={20} className="text-purple-400" />,
    jpg: <Image size={20} className="text-purple-400" />,
    jpeg: <Image size={20} className="text-purple-400" />,
    gif: <Image size={20} className="text-purple-400" />,
    webp: <Image size={20} className="text-purple-400" />,
    svg: <Image size={20} className="text-purple-400" />,
    mp4: <Film size={20} className="text-cyan-400" />,
    mov: <Film size={20} className="text-cyan-400" />,
    avi: <Film size={20} className="text-cyan-400" />,
    mp3: <Music size={20} className="text-pink-400" />,
    wav: <Music size={20} className="text-pink-400" />,
    zip: <Archive size={20} className="text-yellow-400" />,
    rar: <Archive size={20} className="text-yellow-400" />,
    '7z': <Archive size={20} className="text-yellow-400" />,
};

function getFileIcon(fileName: string) {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    return FILE_ICON_MAP[ext] || <FileText size={20} className="text-slate-400" />;
}

function getExtLabel(fileName: string) {
    const ext = fileName.split('.').pop()?.toUpperCase() ?? 'FILE';
    return ext;
}

export default function FileMessage({ fileName, fileUrl, fileSize }: FileMessageProps) {
    return (
        <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 min-w-[240px] max-w-[320px] hover:bg-slate-700/40 transition-colors group">
            {/* Icon */}
            <div className="w-10 h-10 rounded-lg bg-slate-700/80 flex items-center justify-center shrink-0">
                {getFileIcon(fileName)}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
                <p className="text-sm text-white font-medium truncate">{fileName}</p>
                <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 font-mono">{getExtLabel(fileName)}</span>
                    {fileSize && <span className="text-[10px] text-slate-500">{fileSize}</span>}
                </div>
            </div>

            {/* Download */}
            <a
                href={fileUrl}
                target="_blank"
                rel="noreferrer"
                className="p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-600 transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                title="下载"
            >
                <Download size={16} />
            </a>
        </div>
    );
}
