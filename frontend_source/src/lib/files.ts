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

export function formatSize(size: number | string): string {
  const n = Number(size) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}