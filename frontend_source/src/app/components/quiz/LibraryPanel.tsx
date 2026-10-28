'use client';

// ============================================================
// 📚 LIBRARY (Quiz Center tab) - the books you study
// ============================================================
// A book is a node with the 📖 Book role; its chapters are sub-nodes with
// the 📑 Chapter role (made for you when you add the book). Per book:
//   📕 PDF      attach one (stored in 📁 Files on the book), 📖 Read it here
//               (opens at the page you're on), ⬇ Download
//   progress   "I'm on page …" — the bar shows pages and chapters finished
// Per chapter:
//   ❓ Before reading  write what you expect / want answered (primes reading)
//   📝 Summary         write it here (kept as the chapter's "📝 Summary" doc —
//                      card lines in it become questions) or upload a file
//   ✓ Finished         starts spaced chapter reviews (1, 3, 7, 16, 35, 90 days…)
//   🔁 Review          free recall → compare with your summary → connect → questions
//   🧪 Questions · ➕ · 🪜 LLE ladder
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import type { LibraryFile } from '@/lib/files';
import { fileType, fileUrl } from '@/lib/files';
import { FilePreview } from '../FilesPanel';
import MathText from '@/lib/MathText';
import { unCloze } from '@/lib/lle';

export interface ChapterInfo {
  id: number; name: string;
  chapter: { number?: number | null; startPage?: number | null; endPage?: number | null; finishedAt?: string | null; preQuestions?: string };
  cards: number; cardsDue: number; summaryDocId: number | null; lleDocId: number | null; files: LibraryFile[];
  nextReview: { id: number; step: number; due: string } | null;
}
export interface BookInfo {
  id: number; name: string; description: string; tags: string[]; files: LibraryFile[]; cards: number; summaryDocId: number | null;
  book: { author?: string; totalPages?: number | null; currentPage?: number | null; status?: 'reading' | 'planned' | 'finished'; fileId?: number | null };
  chapters: ChapterInfo[];
}

interface Props {
  apiUrl: string;
  today: string;
  refreshKey: number;
  onReview: (reviewId: number, chapter: { id: number; name: string }) => void;
  onQuizNode: (nodeId: number, title: string) => void;
  onNewQuestion: (nodeId: number) => void;
  onLadder: (node: { id: number; name: string }) => void;
  onOpenDocs: (nodeId: number, docId?: number | null) => void;
  onShowNode: (nodeId: number) => void;
  onNodesChanged: () => void;
}

const btn: React.CSSProperties = { border: 'none', padding: '6px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12 };
const field: React.CSSProperties = { background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '6px 8px', fontSize: 13, fontFamily: 'inherit' };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9990 };
const box: React.CSSProperties = { background: '#2a2a3a', padding: 20, borderRadius: 8, width: 720, maxWidth: '96vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid #444', color: '#ccc', fontSize: 13 };
const STATUS = { reading: '📖 Reading', planned: '🗓 Planned', finished: '✅ Finished' } as const;

async function call(url: string, method = 'GET', body?: any) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.message || `Error ${r.status}`);
  return d;
}

async function upload(apiUrl: string, file: File, nodeId: number): Promise<LibraryFile> {
  const form = new FormData();
  form.append('file', file);
  form.append('nodeId', String(nodeId));
  const r = await fetch(`${apiUrl}/api/mindmap/files`, { method: 'POST', body: form, credentials: 'include' });
  if (!r.ok) throw new Error(r.status === 413 ? 'Too big for the server' : `Upload failed (${r.status})`);
  return r.json();
}

export default function LibraryPanel(p: Props) {
  const { apiUrl, today } = p;
  const [books, setBooks] = useState<BookInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<Set<number>>(() => { try { return new Set(JSON.parse(localStorage.getItem('hserver:libOpen') || '[]')); } catch { return new Set(); } });
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', author: '', totalPages: '', chapters: '', status: 'reading' });
  const [error, setError] = useState('');
  const [reading, setReading] = useState<{ book: BookInfo; file: LibraryFile } | null>(null);
  const [pageDraft, setPageDraft] = useState<Record<number, string>>({});
  const [chapterOpen, setChapterOpen] = useState<{ book: BookInfo; ch: ChapterInfo } | null>(null);
  const [editBook, setEditBook] = useState<BookInfo | null>(null);
  const [filter, setFilter] = useState<'all' | 'reading' | 'planned' | 'finished'>('all');

  const load = useCallback(async () => {
    try { setBooks(await call(`${apiUrl}/api/mindmap/study/library?day=${today}`)); } catch (e: any) { setError(e.message); }
    setLoaded(true);
  }, [apiUrl, today]);
  useEffect(() => { load(); }, [load, p.refreshKey]);

  const toggle = (id: number) => setOpen(prev => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id);
    try { localStorage.setItem('hserver:libOpen', JSON.stringify(Array.from(n))); } catch {}
    return n;
  });

  const run = async (fn: () => Promise<any>, reloadNodes = false) => {
    setError('');
    try { await fn(); await load(); if (reloadNodes) p.onNodesChanged(); } catch (e: any) { setError(e.message); }
  };

  // Book metadata is replaced whole by the backend's merge, so always send all of it
  const saveBook = (bk: BookInfo, changes: Partial<BookInfo['book']>) =>
    run(() => call(`${apiUrl}/api/mindmap/node/${bk.id}`, 'PUT', { metadata: { book: { ...bk.book, ...changes } } }), true);
  const saveChapter = (ch: ChapterInfo, changes: Partial<ChapterInfo['chapter']>) =>
    run(() => call(`${apiUrl}/api/mindmap/node/${ch.id}`, 'PUT', { metadata: { chapter: { ...ch.chapter, ...changes } } }), true);

  const addBook = () => run(async () => {
    await call(`${apiUrl}/api/mindmap/study/books`, 'POST', {
      name: form.name.trim(), author: form.author.trim(), totalPages: Number(form.totalPages) || null,
      chapters: Number(form.chapters) || 0, status: form.status,
    });
    setForm({ name: '', author: '', totalPages: '', chapters: '', status: 'reading' }); setAdding(false);
  }, true);

  const pdfOf = (bk: BookInfo) => bk.files.find(f => f.id === bk.book.fileId) || bk.files.find(f => fileType(f) === 'pdf') || null;

  const attachPdf = (bk: BookInfo) => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'application/pdf,.pdf,.epub';
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) run(async () => {
        const saved = await upload(apiUrl, f, bk.id);
        await call(`${apiUrl}/api/mindmap/node/${bk.id}`, 'PUT', { metadata: { book: { ...bk.book, fileId: saved.id, totalPages: bk.book.totalPages || null } } });
      });
    };
    input.click();
  };

  const setPage = (bk: BookInfo) => {
    const v = Math.round(Number(pageDraft[bk.id]));
    if (!(v >= 0)) return;
    saveBook(bk, { currentPage: v, ...(bk.book.totalPages && v >= bk.book.totalPages ? { status: 'finished' as const } : {}) });
    setPageDraft(d => ({ ...d, [bk.id]: '' }));
  };

  const finish = (ch: ChapterInfo, finished: boolean) =>
    run(() => call(`${apiUrl}/api/mindmap/study/chapters/${ch.id}/finish`, 'POST', { finished, day: today }), true);

  const addChapter = (bk: BookInfo) => {
    const next = (bk.chapters.reduce((m, c) => Math.max(m, Number(c.chapter.number) || 0), 0) || 0) + 1;
    const name = prompt(`Name of chapter ${next}:`, `${bk.name} — Chapter ${next}`);
    if (name) run(() => call(`${apiUrl}/api/mindmap/study/books/${bk.id}/chapters`, 'POST', { name, number: next }), true);
  };

  const shown = books.filter(b => filter === 'all' || (b.book.status || 'reading') === filter);

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={() => setAdding(a => !a)} style={{ ...btn, background: '#0070f3', color: '#fff', padding: '8px 14px', fontSize: 13 }}>+ Add book</button>
        {(['all', 'reading', 'planned', 'finished'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ ...btn, background: filter === f ? '#3b3b55' : 'transparent', color: filter === f ? '#fff' : '#888', border: '1px solid #3b3b55' }}>
            {f === 'all' ? `All (${books.length})` : `${STATUS[f]} (${books.filter(b => (b.book.status || 'reading') === f).length})`}
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <button onClick={load} title="Reload" style={{ ...btn, background: '#333', color: '#ccc' }}>↻</button>
      </div>

      {adding && (
        <div style={{ background: '#2a2a3a', borderRadius: 8, padding: 14, marginBottom: 14, display: 'grid', gridTemplateColumns: '2fr 1.4fr 0.8fr 0.8fr 1fr auto', gap: 8, alignItems: 'end' }}>
          <label style={{ fontSize: 11, color: '#999' }}>Title<input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Machinery's Handbook" style={{ ...field, width: '100%', boxSizing: 'border-box' }} /></label>
          <label style={{ fontSize: 11, color: '#999' }}>Author<input value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} style={{ ...field, width: '100%', boxSizing: 'border-box' }} /></label>
          <label style={{ fontSize: 11, color: '#999' }}>Pages<input type="number" min={0} value={form.totalPages} onChange={e => setForm({ ...form, totalPages: e.target.value })} style={{ ...field, width: '100%', boxSizing: 'border-box' }} /></label>
          <label style={{ fontSize: 11, color: '#999' }}>Chapters<input type="number" min={0} max={200} value={form.chapters} onChange={e => setForm({ ...form, chapters: e.target.value })} title="Makes Chapter 1…N sub-nodes (rename them later)" style={{ ...field, width: '100%', boxSizing: 'border-box' }} /></label>
          <label style={{ fontSize: 11, color: '#999' }}>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })} style={{ ...field, width: '100%' }}>
            <option value="reading">Reading</option><option value="planned">Planned</option></select></label>
          <button onClick={addBook} disabled={!form.name.trim()} style={{ ...btn, background: '#16a34a', color: '#fff', padding: '8px 14px' }}>Add</button>
        </div>
      )}
      {error && <div style={{ color: '#f87171', marginBottom: 10 }}>{error}</div>}

      {loaded && !books.length && (
        <div style={{ color: '#777', padding: 30, textAlign: 'center', lineHeight: 1.7, background: '#2a2a3a', borderRadius: 8 }}>
          No books yet. <b>+ Add book</b> makes a 📖 Book node with its 📑 chapters as sub-nodes.<br />
          Already have a book node? Right-click it → 🏷 Role &amp; tags… → 📖 Book.
        </div>
      )}

      {shown.map(bk => {
        const pdf = pdfOf(bk);
        const done = bk.chapters.filter(c => c.chapter.finishedAt).length;
        const total = Number(bk.book.totalPages) || 0, cur = Number(bk.book.currentPage) || 0;
        const pct = total ? Math.min(100, Math.round((cur / total) * 100)) : bk.chapters.length ? Math.round((done / bk.chapters.length) * 100) : 0;
        const dueReviews = bk.chapters.filter(c => c.nextReview && c.nextReview.due <= today).length;
        return (
          <div key={bk.id} style={{ background: '#2a2a3a', borderRadius: 8, marginBottom: 10, border: '1px solid #33334a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', flexWrap: 'wrap' }}>
              <span onClick={() => toggle(bk.id)} style={{ cursor: 'pointer', color: '#888', width: 14 }}>{open.has(bk.id) ? '▾' : '▸'}</span>
              <div style={{ flex: 1, minWidth: 200, cursor: 'pointer' }} onClick={() => toggle(bk.id)}>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>📖 {bk.name}</div>
                <div style={{ color: '#888', fontSize: 12 }}>
                  {bk.book.author || 'Author not set'} · {STATUS[bk.book.status || 'reading']}
                  {total ? ` · page ${cur} of ${total}` : cur ? ` · page ${cur}` : ''}
                  {bk.chapters.length ? ` · ${done}/${bk.chapters.length} chapters` : ''}
                  {dueReviews ? <span style={{ color: '#f59e0b' }}> · 🔁 {dueReviews} review{dueReviews === 1 ? '' : 's'} due</span> : ''}
                </div>
                <div style={{ height: 5, background: '#1e1e2e', borderRadius: 3, marginTop: 6, maxWidth: 420 }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: pct >= 100 ? '#22c55e' : '#3b82f6', borderRadius: 3 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input value={pageDraft[bk.id] ?? ''} onChange={e => setPageDraft(d => ({ ...d, [bk.id]: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') setPage(bk); }} placeholder="I'm on page…" type="number" min={0}
                  style={{ ...field, width: 110, padding: '5px 7px', fontSize: 12 }} aria-label={`Current page of ${bk.name}`} />
                <button onClick={() => setPage(bk)} disabled={!pageDraft[bk.id]} style={{ ...btn, background: '#333', color: '#ddd' }}>Save page</button>
                {pdf ? (
                  <>
                    <button onClick={() => setReading({ book: bk, file: pdf })} style={{ ...btn, background: '#1d4ed8', color: '#fff' }}>📖 Read</button>
                    <a href={fileUrl(pdf.path)} download={pdf.name} style={{ ...btn, background: '#333', color: '#ddd', textDecoration: 'none' }}>⬇ PDF</a>
                  </>
                ) : (
                  <button onClick={() => attachPdf(bk)} style={{ ...btn, background: '#333', color: '#ddd' }}>📎 Attach PDF</button>
                )}
                <button onClick={() => setEditBook(bk)} title="Author, pages, status, PDF" style={{ ...btn, background: '#333', color: '#ccc' }}>✎</button>
              </div>
            </div>

            {open.has(bk.id) && (
              <div style={{ borderTop: '1px solid #33334a', padding: '6px 14px 12px' }}>
                {bk.chapters.length === 0 && <div style={{ color: '#777', padding: 10 }}>No chapters yet.</div>}
                {bk.chapters.map(ch => {
                  const due = ch.nextReview && ch.nextReview.due <= today;
                  return (
                    <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid #2f2f45', flexWrap: 'wrap' }}>
                      <button onClick={() => finish(ch, !ch.chapter.finishedAt)} title={ch.chapter.finishedAt ? `Finished ${ch.chapter.finishedAt} — click to undo` : 'Mark finished (starts spaced reviews)'}
                        style={{ ...btn, width: 28, padding: '4px 0', background: ch.chapter.finishedAt ? '#14532d' : '#1e1e2e', color: ch.chapter.finishedAt ? '#86efac' : '#666', border: '1px solid #3b3b55' }}>
                        {ch.chapter.finishedAt ? '✓' : ''}
                      </button>
                      <span style={{ color: '#777', width: 28, textAlign: 'right' }}>{ch.chapter.number ?? ''}</span>
                      <span onClick={() => setChapterOpen({ book: bk, ch })} style={{ flex: 1, minWidth: 160, color: '#eee', cursor: 'pointer' }} title="Summary, before-reading questions, files">
                        {ch.name}
                        {(ch.chapter.startPage || ch.chapter.endPage) && <span style={{ color: '#777', fontSize: 11 }}> · pp. {ch.chapter.startPage ?? '?'}–{ch.chapter.endPage ?? '?'}</span>}
                      </span>
                      <span style={{ fontSize: 11, color: due ? '#f59e0b' : '#777', minWidth: 120 }}>
                        {ch.nextReview ? (due ? '🔁 review due' : `next review ${ch.nextReview.due}`) : ch.chapter.finishedAt ? '' : 'not finished'}
                      </span>
                      <button onClick={() => setChapterOpen({ book: bk, ch })} title="Summary" style={{ ...btn, background: ch.summaryDocId ? '#1e3a5f' : '#333', color: ch.summaryDocId ? '#93c5fd' : '#aaa' }}>📝{ch.summaryDocId ? '' : ' Summary'}</button>
                      <button onClick={() => ch.nextReview && p.onReview(ch.nextReview.id, { id: ch.id, name: ch.name })} disabled={!ch.nextReview}
                        title={ch.nextReview ? (due ? 'Review now' : `Due ${ch.nextReview.due} — you can review early`) : 'Mark the chapter finished to start reviews'}
                        style={{ ...btn, background: due ? '#f59e0b' : '#333', color: due ? '#000' : ch.nextReview ? '#ddd' : '#555' }}>🔁</button>
                      <button onClick={() => p.onQuizNode(ch.id, ch.name)} disabled={!ch.cards} title={ch.cards ? `${ch.cards} question(s)${ch.cardsDue ? `, ${ch.cardsDue} due` : ''}` : 'No questions yet'}
                        style={{ ...btn, background: ch.cards ? '#6d28d9' : '#333', color: ch.cards ? '#fff' : '#555' }}>🧪 {ch.cards}</button>
                      <button onClick={() => p.onNewQuestion(ch.id)} title="New question" style={{ ...btn, background: '#333', color: '#ddd' }}>➕</button>
                      <button onClick={() => p.onLadder({ id: ch.id, name: ch.name })} title="LLE ladder: notes + questions at every level" style={{ ...btn, background: '#333', color: '#ddd' }}>🪜</button>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <button onClick={() => addChapter(bk)} style={{ ...btn, background: '#333', color: '#ddd' }}>+ Add chapter</button>
                  <button onClick={() => p.onQuizNode(bk.id, bk.name)} style={{ ...btn, background: '#333', color: '#ddd' }}>🧪 Quiz the whole book</button>
                  <button onClick={() => p.onLadder({ id: bk.id, name: bk.name })} style={{ ...btn, background: '#333', color: '#ddd' }}>🪜 Ladder for the book</button>
                  <button onClick={() => p.onShowNode(bk.id)} style={{ ...btn, background: '#333', color: '#ddd' }}>Show on graph</button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* 📖 Reading the PDF, with "I'm on page" kept at the bottom */}
      {reading && (
        <>
          <FilePreview file={reading.file} page={Number(reading.book.book.currentPage) || null} onClose={() => setReading(null)} />
          <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 3001, background: '#1e1e2e', border: '1px solid #444', borderRadius: 8, padding: '8px 12px', display: 'flex', gap: 8, alignItems: 'center', boxShadow: '0 4px 20px #0008' }}>
            <span style={{ color: '#aaa', fontSize: 12 }}>📖 {reading.book.name} — I&apos;m on page</span>
            <input type="number" min={0} value={pageDraft[reading.book.id] ?? ''} placeholder={String(reading.book.book.currentPage || '')}
              onChange={e => setPageDraft(d => ({ ...d, [reading.book.id]: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') { setPage(reading.book); setReading(null); } }}
              style={{ ...field, width: 80, padding: '4px 6px' }} aria-label="Page I'm on" />
            <button onClick={() => { setPage(reading.book); setReading(null); }} style={{ ...btn, background: '#16a34a', color: '#fff' }}>Save &amp; close</button>
          </div>
        </>
      )}

      {chapterOpen && (
        <ChapterDialog apiUrl={apiUrl} book={chapterOpen.book} ch={chapterOpen.ch}
          onClose={() => { setChapterOpen(null); load(); }}
          onSaveChapter={changes => saveChapter(chapterOpen.ch, changes)}
          onOpenDocs={p.onOpenDocs} />
      )}

      {editBook && (
        <BookDialog apiUrl={apiUrl} bk={editBook} onClose={() => setEditBook(null)}
          onSave={changes => { saveBook(editBook, changes); setEditBook(null); }}
          onUploaded={load} />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// ✎ Book details: author, pages, status, which PDF
// ------------------------------------------------------------
function BookDialog({ apiUrl, bk, onClose, onSave, onUploaded }: { apiUrl: string; bk: BookInfo; onClose: () => void; onSave: (c: Partial<BookInfo['book']>) => void; onUploaded: () => void }) {
  const [title, setTitle] = useState(bk.name);
  const [error, setError] = useState('');
  const [author, setAuthor] = useState(bk.book.author || '');
  const [total, setTotal] = useState(String(bk.book.totalPages ?? ''));
  const [status, setStatus] = useState(bk.book.status || 'reading');
  const [fileId, setFileId] = useState<number | null>(bk.book.fileId ?? null);
  const [busy, setBusy] = useState('');
  const pdfs = bk.files.filter(f => fileType(f) === 'pdf' || /\.epub$/i.test(f.name));
  const chosen = pdfs.find(f => f.id === fileId);
  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
           <div style={{ ...box, width: 480 }} role="dialog" aria-label="Book details">
        <h3 style={{ color: '#fff', marginTop: 0 }}>✎ {bk.name}</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 10px', alignItems: 'center' }}>
          <span>Title</span><input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} aria-label="Book title" style={field} />
          <span>Author</span><input value={author} onChange={e => setAuthor(e.target.value)} style={field} />
          <span>Pages</span><input type="number" min={0} value={total} onChange={e => setTotal(e.target.value)} placeholder={chosen?.text_pages ? `PDF has ${chosen.text_pages}` : ''} style={field} />
          <span>Status</span>
          <select value={status} onChange={e => setStatus(e.target.value as any)} style={field}>
            {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <span>PDF</span>
          <select value={fileId ?? ''} onChange={e => setFileId(e.target.value ? Number(e.target.value) : null)} style={field}>
            <option value="">{pdfs.length ? '(first PDF on the book)' : 'none attached'}</option>
            {pdfs.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <div style={{ marginTop: 10 }}>
          <button disabled={!!busy} onClick={() => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = 'application/pdf,.pdf,.epub';
            input.onchange = async () => {
              const f = input.files?.[0]; if (!f) return;
              setBusy('Uploading…');
              try { const saved = await upload(apiUrl, f, bk.id); setFileId(saved.id); onUploaded(); setBusy(''); } catch (e: any) { setBusy(e.message); }
            };
            input.click();
          }} style={{ ...btn, background: '#333', color: '#ddd' }}>📎 Upload another PDF</button>
          {busy && <span style={{ marginLeft: 8, color: '#f59e0b' }}>{busy}</span>}
        </div>
                <div style={{ color: '#777', fontSize: 11, marginTop: 8 }}>Files you upload here also show in 📁 Files (attached to this book).</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button onClick={onClose} style={{ ...btn, background: '#333', color: '#ccc', fontSize: 13 }}>Cancel</button>
          {error && <span style={{ color: '#f87171', alignSelf: 'center', flex: 1 }}>{error}</span>}
          <button onClick={async () => {
            // ✏️ Renaming the book: its chapters follow it (they point at the book by name)
            if (title.trim() && title.trim() !== bk.name) {
              try { await call(`${apiUrl}/api/mindmap/node/${bk.id}`, 'PUT', { name: title.trim() }); }
              catch (e: any) { setError(e.message); return; }
            }
            onSave({ author, totalPages: Number(total) || (chosen?.text_pages ?? null), status: status as any, fileId });
          }}
            style={{ ...btn, background: '#0070f3', color: '#fff', fontSize: 13 }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 📑 A chapter: before-reading questions, pages, summary, files
// ------------------------------------------------------------
function ChapterDialog({ apiUrl, book, ch, onClose, onSaveChapter, onOpenDocs }: {
  apiUrl: string; book: BookInfo; ch: ChapterInfo; onClose: () => void;
  onSaveChapter: (c: Partial<ChapterInfo['chapter']>) => Promise<void> | void;
  onOpenDocs: (nodeId: number, docId?: number | null) => void;
}) {
   const [summary, setSummary] = useState<{ docId: number | null; text: string } | null>(null);
  const [adding, setAdding] = useState('');
  const [pre, setPre] = useState(ch.chapter.preQuestions || '');
  const [name, setName] = useState(ch.name);
  const [start, setStart] = useState(String(ch.chapter.startPage ?? ''));
  const [end, setEnd] = useState(String(ch.chapter.endPage ?? ''));
  const [files, setFiles] = useState<LibraryFile[]>(ch.files);
  const [preview, setPreview] = useState<LibraryFile | null>(null);
  const [msg, setMsg] = useState('');

  const loadSummary = useCallback(async () => {
    try { setSummary(await call(`${apiUrl}/api/mindmap/study/summary/${ch.id}`)); } catch {}
  }, [apiUrl, ch.id]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !preview) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, preview]);

  const saveSummary = async () => {
    if (!adding.trim()) return;
    try { await call(`${apiUrl}/api/mindmap/study/summary/${ch.id}`, 'POST', { text: adding }); setAdding(''); setMsg('✓ Added to the summary'); loadSummary(); }
       catch (e: any) { setMsg(e.message); }
  };
  const saveDetails = async () => {
    // ✏️ A new name first: it can be refused (names are unique)
    if (name.trim() && name.trim() !== ch.name) {
      try { await call(`${apiUrl}/api/mindmap/node/${ch.id}`, 'PUT', { name: name.trim() }); }
      catch (e: any) { setMsg(e.message); return; }
    }
    await onSaveChapter({ preQuestions: pre, startPage: Number(start) || null, endPage: Number(end) || null });
    setMsg('✓ Saved');
  };
  const uploadFile = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async () => {
      const f = input.files?.[0]; if (!f) return;
      setMsg('Uploading…');
      try { const saved = await upload(apiUrl, f, ch.id); setFiles(fs => [...fs, saved]); setMsg('✓ Uploaded'); } catch (e: any) { setMsg(e.message); }
    };
    input.click();
  };

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box} role="dialog" aria-label="Chapter">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <h3 style={{ color: '#fff', margin: 0 }}>📑 {ch.name}</h3>
            <div style={{ color: '#888', fontSize: 12, marginTop: 3 }}>{book.name}{ch.chapter.finishedAt ? ` · finished ${ch.chapter.finishedAt}` : ''}</div>
          </div>
          <button onClick={onClose} style={{ ...btn, background: 'none', color: '#888', fontSize: 15 }}>✕</button>
               </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 14 }}>
          <span>Name</span>
          <input value={name} onChange={e => setName(e.target.value)} maxLength={200} aria-label="Chapter name" style={{ ...field, flex: 1 }} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
          <span>Pages</span>
          <input type="number" min={0} value={start} onChange={e => setStart(e.target.value)} placeholder="from" style={{ ...field, width: 80 }} />
          <span>–</span>
          <input type="number" min={0} value={end} onChange={e => setEnd(e.target.value)} placeholder="to" style={{ ...field, width: 80 }} />
        </div>

               <div style={{ color: '#aaa', margin: '14px 0 4px' }}>❓ Before reading <span style={{ color: '#666', fontSize: 12 }}>— skim the headings, then write what you expect or want answered (one per line). Your reviews show them again.</span></div>
        <textarea value={pre} onChange={e => setPre(e.target.value)} rows={3} style={{ ...field, width: '100%', boxSizing: 'border-box' }}
          placeholder={'What sets the feed limit for small tools?\nHow do they pick surface speed per material?'} />
        <button onClick={saveDetails} style={{ ...btn, background: '#333', color: '#ddd', marginTop: 6 }}>Save name, pages + questions</button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 6px' }}>
          <span style={{ color: '#fff', fontWeight: 600 }}>📝 Summary</span>
          <span style={{ flex: 1 }} />
          {summary?.docId != null && <button onClick={() => onOpenDocs(ch.id, summary.docId)} style={{ ...btn, background: '#333', color: '#ddd' }}>✎ Edit in Docs</button>}
        </div>
        
        <div style={{ background: '#1e1e2e', borderRadius: 6, padding: 10, maxHeight: 220, overflow: 'auto', color: '#ccc' }}>
          {summary?.text ? summary.text.split('\n').map((l, i) => <div key={i} style={{ padding: '1px 0' }}><MathText text={unCloze(l)} /></div>)
            : <span style={{ color: '#666' }}>No summary yet. Write it in your own words after reading — from memory first, then check the book.</span>}
        </div>
        <textarea value={adding} onChange={e => setAdding(e.target.value)} rows={4} style={{ ...field, width: '100%', boxSizing: 'border-box', marginTop: 8 }}
          placeholder={'One idea per line. Card lines become questions:\nChip load :: material removed per tooth per revolution\nRPM = {{c1::12 × SFM}} / {{c1::π × D}}'} />
        <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={saveSummary} disabled={!adding.trim()} style={{ ...btn, background: adding.trim() ? '#2563eb' : '#333', color: '#fff' }}>{summary?.text ? 'Add to summary' : 'Save summary'}</button>
          <button onClick={uploadFile} style={{ ...btn, background: '#333', color: '#ddd' }}>📎 Upload a summary file</button>
          {msg && <span style={{ color: msg.startsWith('✓') ? '#86efac' : '#f59e0b' }}>{msg}</span>}
        </div>

        {files.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>Files on this chapter</div>
            {files.map(f => (
              <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '3px 0' }}>
                <span onClick={() => setPreview(f)} style={{ color: '#93c5fd', cursor: 'pointer', flex: 1 }}>{f.name}</span>
                <a href={fileUrl(f.path)} download={f.name} style={{ color: '#888', fontSize: 12 }}>⬇</a>
              </div>
            ))}
          </div>
        )}
        {preview && <FilePreview file={preview} onClose={() => setPreview(null)} />}
      </div>
    </div>
  );
}