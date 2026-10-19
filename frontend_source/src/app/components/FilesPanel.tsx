'use client';

// ============================================================
// FILES - the file library (📁 Files view) and a node's files (📎 Files window)
// ============================================================
// - Upload: ⬆ button or drop files anywhere on the panel
// - 🌐 Save link: a web page becomes a document (with an offline copy),
//   anything else (PDF, video, zip…) is downloaded into the library
// - Click a file to preview it (pictures, video, audio, PDF, text,
//   saved pages); double-click the name to rename it
// - In the library: choose which node a file belongs to, find files
//   that were already in cloud_data (scanned when you open it), and
//   the 📌 "Send to HServer" bookmark button for your browser
// - Delete moves a file to the Trash (restorable for 30 days)
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Node } from '@/lib/types';
import TorrentsPanel from './TorrentsPanel';
import {
  type LibraryFile, type FileType, fileUrl, fileType, formatSize, isWebPage, offlineCopyUrl, FILE_ICONS, pageLabel, playUrl, formatDuration,
} from '@/lib/files';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const TYPES: { key: string; label: string }[] = [
  { key: '', label: 'All' }, { key: 'image', label: '🖼️ Pictures' }, { key: 'video', label: '🎬 Video' },
  { key: 'audio', label: '🎵 Audio' }, { key: 'document', label: '📕 Documents' }, { key: 'web', label: '🌐 Web pages' },
  { key: 'other', label: '📦 Other' },
];

const btn: React.CSSProperties = { background: '#333', color: '#ccc', border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' };
const input: React.CSSProperties = { background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '5px 8px', fontSize: 12 };

interface Upload { id: number; name: string; pct: number; error?: string }

interface FilesPanelProps {
  nodeId?: number;          // a node's files; leave out for the whole library
  nodes?: Node[];           // library: to choose which node a file belongs to
  onSavedPage?: () => void; // a web page was saved as a document (e.g. refresh Docs)
}

// Upload one file with progress
function uploadFile(file: File, nodeId: number | undefined, onProgress: (pct: number) => void): Promise<LibraryFile> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const form = new FormData();
    form.append('file', file);
    if (nodeId) form.append('nodeId', String(nodeId));
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
      else reject(new Error(xhr.status === 413 ? 'Too big for the server (nginx limit)' : `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Upload failed (no connection)'));
    xhr.open('POST', `${API_URL}/api/mindmap/files`);
    xhr.send(form);
  });
}

// ------------------------------------------------------------
// PREVIEW
// ------------------------------------------------------------
// Also used by the search bar and Backlinks (page = PDF page to open at)
export function FilePreview({ file, onClose, page }: { file: LibraryFile; onClose: () => void; page?: number | null }) {
  const type = fileType(file);
  const url = fileUrl(file.path);
  const [text, setText] = useState<string | null>(null);
  const [small, setSmall] = useState(false);   // play the 720p copy (away from home)

  useEffect(() => {
    if (type !== 'text') return;
    fetch(url).then(r => r.text()).then(t => setText(t.length > 200_000 ? t.slice(0, 200_000) + '\n…' : t)).catch(() => setText('Could not load the file.'));
  }, [type, url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const frame: React.CSSProperties = { width: '100%', height: '100%', border: 'none', background: '#fff', borderRadius: 4 };
  let body: React.ReactNode;
  if (type === 'image') body = <img src={url} alt={file.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />;
  else if (type === 'video') {
    const src = small && file.small_path ? fileUrl(file.small_path) : playUrl(file);
    body = (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, maxWidth: '100%', maxHeight: '100%' }}>
        {file.media_status === 'converting' && <div style={{ color: '#f59e0b', fontSize: 12 }}>Still converting for the browser ({Math.round(file.media_progress || 0)}%) — it may not play until that finishes.</div>}
        <video key={src} src={src} controls autoPlay style={{ maxWidth: '100%', maxHeight: 'calc(100vh - 140px)' }} />
      </div>
    );
  }
  else if (type === 'audio') body = <audio src={playUrl(file)} controls autoPlay style={{ width: '80%' }} />;
  else if (type === 'pdf') body = <iframe src={page ? `${url}#page=${page}` : url} title={file.name} style={frame} />;
  // Saved pages: no scripts (sandbox) — they are other sites' HTML served from this server
  else if (type === 'web') body = <iframe src={offlineCopyUrl(file)} title={file.name} sandbox="allow-popups allow-popups-to-escape-sandbox" style={frame} />;
  else if (type === 'text') body = <pre style={{ ...frame, background: '#111', color: '#ddd', margin: 0, padding: 16, overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: 13 }}>{text ?? 'Loading…'}</pre>;
  else body = <div style={{ color: '#aaa' }}>No preview for this kind of file. <a href={url} target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>Open</a> or <a href={url} download={file.name} style={{ color: '#60a5fa' }}>download</a> it.</div>;

  return (
    <div onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.8)', display: 'flex', flexDirection: 'column', padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#ddd', marginBottom: 10 }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14 }}>{FILE_ICONS[type]} {file.name}</span>
        {type === 'web' && <a href={fileUrl(file.path)} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>Full page</a>}
        {type === 'video' && file.small_path && (
          <button onClick={() => setSmall(s => !s)} title="The 720p copy loads faster away from home" style={{ ...btn, background: small ? '#0070f3' : '#333', color: '#fff' }}>
            {small ? '📶 720p' : 'Full quality'}
          </button>
        )}
        {file.source_url && <a href={file.source_url} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>Original ↗</a>}
        <a href={url} download={type === 'web' ? undefined : file.name} target="_blank" rel="noreferrer" style={{ ...btn, textDecoration: 'none' }}>{type === 'web' ? 'Open' : 'Download'}</a>
        <button onClick={onClose} style={btn}>✕ Close</button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{body}</div>
    </div>
  );
}

// ------------------------------------------------------------
// 📌 "Send to HServer" bookmark button (library only)
// ------------------------------------------------------------
function SendToHServer() {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Opens a tab first (browsers only allow that right after the click), asks for a node,
  // then posts the page as you see it — so pages you're logged in to work too.
  const code = useMemo(() => {
    const target = `${API_URL}/api/mindmap/clip/page`;
    const body = `(function(){var w=window.open('about:blank','hserver_clip');` +
      `var n=prompt('Save this page to HServer.\\nNode name (leave empty for Unfiled):','');` +
      `if(n===null){if(w)w.close();return;}` +
      `var f=document.createElement('form');f.method='POST';f.action=${JSON.stringify(target)};f.target='hserver_clip';` +
      `f.acceptCharset='utf-8';f.style.display='none';` +
      `var a=function(k,v){var t=document.createElement('textarea');t.name=k;t.value=v;f.appendChild(t);};` +
      `a('url',location.href);a('title',document.title);a('node',n);a('html',document.documentElement.outerHTML);` +
      `document.body.appendChild(f);f.submit();f.remove();})()`;
    return 'javascript:' + encodeURIComponent(body);
  }, []);
  // React blocks javascript: links in JSX, so the bookmark's address is set directly
  useEffect(() => { linkRef.current?.setAttribute('href', code); }, [code, open]);
  // Close when clicking anywhere else
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as any)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={btn}>📌 Browser button</button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: '110%', zIndex: 50, width: 340, background: '#252536', border: '1px solid #444', borderRadius: 6, padding: 12, fontSize: 12, color: '#bbb', lineHeight: 1.5 }}>
          <div style={{ marginBottom: 8 }}>
            Drag this to your bookmarks bar:{' '}
            <a ref={linkRef} onClick={e => e.preventDefault()}
              style={{ background: '#0070f3', color: '#fff', padding: '3px 8px', borderRadius: 4, textDecoration: 'none', cursor: 'grab' }}>
              📌 Send to HServer
            </a>
          </div>
          <div>On any page, click it, type a node name (or leave it empty) and the page is saved as you see it — including pages you are logged in to.</div>
          <div style={{ marginTop: 6, color: '#888' }}>A few sites block buttons like this; for those, copy the link and use 🌐 Save link instead.</div>
          <button style={{ ...btn, marginTop: 8 }} onClick={() => { navigator.clipboard?.writeText(code).then(() => setCopied(true)).catch(() => {}); }}>
            {copied ? '✓ Copied' : 'Copy the code (for a bookmark you make by hand)'}
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// PANEL
// ------------------------------------------------------------
export default function FilesPanel({ nodeId, nodes = [], onSavedPage }: FilesPanelProps) {
  const isLibrary = nodeId === undefined;
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [preview, setPreview] = useState<LibraryFile | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showLink, setShowLink] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [savingLink, setSavingLink] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [tab, setTab] = useState<'files' | 'torrents'>('files');   // library only: ⬇ Torrents
  const pickerRef = useRef<HTMLInputElement>(null);
  const uploadSeq = useRef(0);

  const load = useCallback(async () => {
    const q = new URLSearchParams();
    if (search.trim()) q.set('search', search.trim());
    if (type) q.set('type', type);
    if (nodeId) q.set('nodeId', String(nodeId));
    try {
      const res = await fetch(`${API_URL}/api/mindmap/files?${q}`);
      setFiles(res.ok ? await res.json() : []);
    } catch { setFiles([]); }
    setLoading(false);
  }, [search, type, nodeId]);

  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
  }, [load]);

  // While videos are being converted (or text read), refresh every few seconds to show progress
  const busy = files.some(f => f.media_status === 'converting' || f.media_status === 'shrinking' || f.media_status === 'queued'
    || (f.text_status == null && f.kind !== 'web'));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [busy, load]);

  const mediaAction = async (f: LibraryFile, action: 'small' | 'retry') => {
    try { await fetch(`${API_URL}/api/mindmap/files/${f.id}/media/${action}`, { method: 'POST' }); } catch {}
    setTimeout(load, 500);
  };

  // The library also picks up files that were put in cloud_data some other way
  useEffect(() => {
    if (!isLibrary) return;
    fetch(`${API_URL}/api/mindmap/files/scan`, { method: 'POST' })
      .then(r => (r.ok ? r.json() : null))
      .then(r => { if (r && (r.added || r.removed)) load(); })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLibrary]);

  const upload = async (list: FileList | File[]) => {
    for (const file of Array.from(list)) {
      const id = ++uploadSeq.current;
      setUploads(u => [...u, { id, name: file.name, pct: 0 }]);
      try {
        await uploadFile(file, nodeId, pct => setUploads(u => u.map(x => (x.id === id ? { ...x, pct } : x))));
        setUploads(u => u.filter(x => x.id !== id));
      } catch (e: any) {
        setUploads(u => u.map(x => (x.id === id ? { ...x, error: e?.message || 'Upload failed' } : x)));
      }
      load();
    }
  };

  const saveLink = async () => {
    const url = linkUrl.trim();
    if (!url) return;
    setSavingLink(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/api/mindmap/clip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: /^https?:\/\//i.test(url) ? url : `https://${url}`, nodeId: nodeId ?? null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Could not save (${res.status})`);
      if (data.kind === 'page') {
        setMessage({ text: `Saved “${data.document.title}” — it's in Docs${nodeId ? '' : ' (Unfiled)'} and here under 🌐 Web pages.` });
        onSavedPage?.();
      } else {
        setMessage({ text: `Saved “${data.file.name}” (${formatSize(data.file.size)}).` });
      }
      setLinkUrl('');
      setShowLink(false);
      load();
    } catch (e: any) {
      setMessage({ text: e?.message || 'Could not save the link', error: true });
    }
    setSavingLink(false);
  };

  const update = async (f: LibraryFile, body: { name?: string; nodeId?: number | null }) => {
    try {
      await fetch(`${API_URL}/api/mindmap/files/${f.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch {}
    load();
  };

  const remove = async (f: LibraryFile) => {
    const extra = isWebPage(f) ? ' The saved copies go with it (its document in Docs stays).' : '';
    if (!confirm(`Move “${f.name}” to the Trash? You can restore it for 30 days.${extra}`)) return;
    try { await fetch(`${API_URL}/api/mindmap/files/${f.id}`, { method: 'DELETE' }); } catch {}
    load();
  };

  const sortedNodes = useMemo(() => [...nodes].sort((a, b) => a.name.localeCompare(b.name)), [nodes]);
  const totalSize = files.reduce((s, f) => s + (Number(f.size) || 0), 0);

  // Library header with the 📁 Files / ⬇ Torrents switch
  const libraryHeader = (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
      <h2 style={{ margin: 0, color: '#fff' }}>📁 Files</h2>
      <span style={{ fontSize: 12, color: '#777' }}>Everything in your cloud_data — {files.length} shown · {formatSize(totalSize)}</span>
      <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
        {(['files', 'torrents'] as const).map(k => (
          <button key={k} onClick={() => setTab(k)}
            style={{ ...btn, background: tab === k ? '#0070f3' : '#2a2a2a', color: tab === k ? '#fff' : '#aaa' }}>
            {k === 'files' ? '📁 Library' : '⬇ Torrents'}
          </button>
        ))}
      </span>
    </div>
  );

  if (isLibrary && tab === 'torrents') {
    return (
      <div style={{ flex: 1, height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: '#1e1e1e', color: '#ccc', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>
        <div style={{ padding: '16px 24px 10px', borderBottom: '1px solid #333' }}>{libraryHeader}</div>
        <div style={{ flex: 1, overflowY: 'auto' }}><TorrentsPanel nodes={nodes} /></div>
      </div>
    );
  }

  return (
    <div
      onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
      onDrop={e => { if (e.dataTransfer.files.length) { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); } }}
      style={{ flex: 1, height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', background: '#1e1e1e', color: '#ccc', position: 'relative', fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif' }}>

      {/* Toolbar */}
      <div style={{ padding: isLibrary ? '16px 24px 10px' : 8, borderBottom: '1px solid #333' }}>
        {isLibrary && libraryHeader}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search files…" style={{ ...input, flex: '1 1 160px', minWidth: 120 }} />
          <button onClick={() => pickerRef.current?.click()} style={{ ...btn, background: '#0070f3', color: '#fff' }}>⬆ Upload</button>
          <button onClick={() => { setShowLink(s => !s); setMessage(null); }} style={btn}>🌐 Save link</button>
          {isLibrary && <SendToHServer />}
          <input ref={pickerRef} type="file" multiple style={{ display: 'none' }}
            onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
        </div>
        {showLink && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <input autoFocus value={linkUrl} onChange={e => setLinkUrl(e.target.value)} disabled={savingLink}
              onKeyDown={e => { if (e.key === 'Enter') saveLink(); if (e.key === 'Escape') setShowLink(false); }}
              placeholder="Paste a link — a page becomes a document, a PDF/video/zip is downloaded" style={{ ...input, flex: 1 }} />
            <button onClick={saveLink} disabled={savingLink} style={{ ...btn, background: '#0070f3', color: '#fff' }}>{savingLink ? 'Saving…' : 'Save'}</button>
          </div>
        )}
        <div style={{ display: 'flex', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
          {TYPES.map(t => (
            <button key={t.key} onClick={() => setType(t.key)}
              style={{ ...btn, padding: '3px 8px', fontSize: 11, background: type === t.key ? '#0070f3' : '#2a2a2a', color: type === t.key ? '#fff' : '#aaa' }}>
              {t.label}
            </button>
          ))}
        </div>
        {message && <div style={{ marginTop: 8, fontSize: 12, color: message.error ? '#ef4444' : '#22c55e' }}>{message.text}</div>}
        {uploads.map(u => (
          <div key={u.id} style={{ marginTop: 6, fontSize: 11, color: u.error ? '#ef4444' : '#aaa', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
            {u.error
              ? <><span>{u.error}</span><button onClick={() => setUploads(x => x.filter(y => y.id !== u.id))} style={{ ...btn, padding: '1px 6px' }}>✕</button></>
              : <span style={{ width: 120, height: 6, background: '#333', borderRadius: 3, overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${u.pct}%`, background: '#0070f3' }} /></span>}
          </div>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: isLibrary ? '8px 24px' : 4 }}>
        {loading && <div style={{ padding: 12, color: '#666' }}>Loading…</div>}
        {!loading && files.length === 0 && (
          <div style={{ padding: 24, color: '#666', textAlign: 'center', fontSize: 13 }}>
            {search || type ? 'No files match.' : 'No files yet — drop files here, ⬆ Upload, or 🌐 Save link.'}
          </div>
        )}
        {files.map(f => {
          const t = fileType(f);
          return (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderBottom: '1px solid #2a2a2a' }}>
              <div onClick={() => setPreview(f)} title="Preview"
                style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 4, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, cursor: 'pointer', overflow: 'hidden' }}>
                {t === 'image' ? <img src={fileUrl(f.path)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : f.thumb_path ? <img src={fileUrl(f.thumb_path)} alt="" loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : FILE_ICONS[t]}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                {renamingId === f.id ? (
                  <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                    onBlur={() => { setRenamingId(null); if (renameValue.trim() && renameValue !== f.name) update(f, { name: renameValue }); }}
                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenamingId(null); }}
                    style={{ ...input, width: '100%' }} />
                ) : (
                  <div onClick={() => setPreview(f)} onDoubleClick={() => { setRenamingId(f.id); setRenameValue(f.name); }} title="Click to preview · double-click to rename"
                    style={{ color: '#eee', fontSize: 13, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.name}
                  </div>
                )}
                <div style={{ fontSize: 11, color: '#777', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {formatSize(f.size)} · {new Date(f.created_at).toLocaleDateString()}
                  {f.source_url && <> · from <a href={f.source_url} target="_blank" rel="noreferrer" style={{ color: '#60a5fa' }}>{(() => { try { return new URL(f.source_url).hostname; } catch { return 'link'; } })()}</a></>}
                  {f.document_id && <> · 📄 in Docs</>}
                  {f.media_info?.duration ? <> · {formatDuration(f.media_info.duration)}</> : null}
                  {f.media_info?.height ? <> · {f.media_info.height}p</> : null}
                  {f.text_status === 'done' && <> · 🔎 text searchable{f.ocr_at ? ' (read by OCR)' : ''}{f.text_pages && f.text_pages > 1 ? ` (${f.text_pages} ${pageLabel(f.name)}s)` : ''}</>}
                  {f.text_status === 'empty' && <span title="No text found (OCR found nothing either)"> · no text found</span>}
                  {f.text_status === 'needs-ocr' && <span title="Text will be read when tesseract is installed (it is on HServer)"> · waiting for OCR</span>}
                  {f.media_status === 'converting' && <span style={{ color: '#f59e0b' }}> · converting for the browser {Math.round(f.media_progress || 0)}%</span>}
                  {f.media_status === 'shrinking' && <span style={{ color: '#f59e0b' }}> · making 720p copy {Math.round(f.media_progress || 0)}%</span>}
                  {f.media_status === 'done' && <> · ▶ browser copy</>}
                  {f.small_path && <> · 📶 720p copy</>}
                  {f.media_status === 'failed' && <span style={{ color: '#ef4444' }}> · couldn&apos;t convert <a onClick={() => mediaAction(f, 'retry')} style={{ color: '#60a5fa', cursor: 'pointer' }}>try again</a></span>}
                  {f.media_status === 'needs-ffmpeg' && <span title="Videos are converted when ffmpeg is installed (it is on HServer)"> · waiting for FFmpeg</span>}
                  {f.text_status === 'failed' && <span style={{ color: '#ef4444' }}> · couldn&apos;t read text</span>}
                  {!isLibrary && f.kind === 'found' && <> · found in cloud_data</>}
                </div>
              </div>
              {isLibrary && (
                <select value={f.node_id ?? ''} onChange={e => update(f, { nodeId: e.target.value ? Number(e.target.value) : null })}
                  title="Node this file belongs to" style={{ ...input, maxWidth: 160 }}>
                  <option value="">— no node —</option>
                  {f.node_id && !sortedNodes.some(n => n.id === f.node_id) && <option value={f.node_id}>{f.node_name || `Node ${f.node_id}`}</option>}
                  {sortedNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
              )}
              {f.media_info?.vcodec && !f.small_path && f.media_status !== 'shrinking' && f.media_status !== 'converting' && (
                <button onClick={() => mediaAction(f, 'small')} title="Make a small 720p copy for watching away from home" style={btn}>📶</button>
              )}
              <a href={t === 'web' ? offlineCopyUrl(f) : t === 'video' || t === 'audio' ? playUrl(f) : fileUrl(f.path)} target="_blank" rel="noreferrer" title="Open in a new tab" style={{ ...btn, textDecoration: 'none' }}>↗</a>
              {!isLibrary && (
                <button onClick={() => update(f, { nodeId: null })} title="Take it off this node (stays in 📁 Files)" style={btn}>⛓</button>
              )}
              <button onClick={() => remove(f)} title="Move to Trash" style={{ ...btn, color: '#ef4444' }}>✕</button>
            </div>
          );
        })}
      </div>

      {dragging && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,112,243,0.15)', border: '2px dashed #0070f3', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18, pointerEvents: 'none' }}>
          Drop to upload{isLibrary ? '' : ' to this node'}
        </div>
      )}
      {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}