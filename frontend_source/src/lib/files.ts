// ============================================================
// FILE LIBRARY helpers (📁 Files, 📎 node files, saved web pages)
// ============================================================

export interface LibraryFile {
  id: number;
  path: string;                 // relative to cloud_data, e.g. files/2026-10/ab12cd-notes.pdf
  name: string;
  mime: string | null;
  size: number | string;        // Postgres BIGINT arrives as a string
  node_id: number | null;
  node_name?: string | null;
  source_url: string | null;
  kind: 'upload' | 'web' | 'found';
  document_id: number | null;
  document_title?: string | null;
   text_status?: 'done' | 'empty' | 'skipped' | 'failed' | 'needs-ocr' | null;   // text read for search (null = not yet)
  text_pages?: number | null;
  ocr_at?: string | null;          // text was read from a picture/scan (OCR)
  // Videos/audio (FFmpeg): browser copy, thumbnail, 720p copy for away from home
  media_status?: 'ok' | 'queued' | 'converting' | 'done' | 'shrinking' | 'failed' | 'needs-ffmpeg' | null;
  media_progress?: number | null;
  media_info?: { duration?: number | null; width?: number; height?: number; vcodec?: string; acodec?: string } | null;
  play_path?: string | null;
  thumb_path?: string | null;
  small_path?: string | null;
  created_at: string;
}

// Files are served at /uploads/... (nginx on the server, a rewrite in next.config.ts on the laptop)
export function fileUrl(path: string): string {
  return '/uploads/' + path.split('/').map(encodeURIComponent).join('/');
}

// A saved web page: page.html is the whole page, article.html the readable offline copy
export const isWebPage = (f: LibraryFile) => f.path.startsWith('web/');
export const offlineCopyUrl = (f: LibraryFile) => fileUrl(f.path.replace(/page\.html$/, 'article.html'));

export type FileType = 'image' | 'video' | 'audio' | 'pdf' | 'text' | 'web' | 'other';

export function fileType(f: LibraryFile): FileType {
  const m = (f.mime || '').toLowerCase();
  if (isWebPage(f)) return 'web';
  if (m.startsWith('image/')) return 'image';
  if (m.startsWith('video/')) return 'video';
  if (m.startsWith('audio/')) return 'audio';
  if (m === 'application/pdf') return 'pdf';
  if (m.startsWith('text/') || m === 'application/json') return 'text';
  return 'other';
}

export const FILE_ICONS: Record<FileType, string> = {
  image: '🖼️', video: '🎬', audio: '🎵', pdf: '📕', text: '📝', web: '🌐', other: '📦',
};

  // What a "page" of a file is called (PDF page, slide, sheet, part of a long text)
  export function pageLabel(nameOrPath: string): string {
    const ext = (nameOrPath.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return 'page';
    if (ext === 'pptx' || ext === 'odp') return 'slide';
    if (ext === 'xlsx' || ext === 'ods') return 'sheet';
    if (ext === 'epub') return 'chapter';
    return 'part';
  }
  // The version that plays in the browser (converted copy if one was made)
export const playUrl = (f: LibraryFile) => fileUrl(f.play_path || f.path);

export function formatDuration(seconds?: number | null): string {
  if (!seconds) return '';
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}
export function formatSize(size: number | string): string {
  const n = Number(size) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}