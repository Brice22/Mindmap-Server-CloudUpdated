'use client';

// ============================================================
// DOCUMENTS PANEL - Multiple BlockNote documents per node
// ============================================================
// Left: documents sorted into named groups (e.g. "Chapter 1")
// Right: the selected document in the BlockNote editor
//
// SAVING: edits stay in the browser until you save.
// - Save button or Ctrl+S saves immediately
// - Switching documents or closing the panel saves first
// - Safety net: unsaved changes are saved every 2 minutes
// - The browser warns you if you try to close the tab unsaved
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const SAFETY_SAVE_MS = 2 * 60 * 1000;

// BlockNote needs the browser, so never render it on the server
const BlockEditor = dynamic(() => import('./BlockEditor'), {
  ssr: false,
  loading: () => <div style={{ padding: 20, color: '#666' }}>Loading editor...</div>,
});

interface DocSummary {
  id: number;
  node_id: number;
  group_name: string;
  title: string;
  sort_order: number;
}

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

const smallBtn: React.CSSProperties = { background: '#333', border: 'none', color: '#ccc', padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 };
const inputStyle: React.CSSProperties = { width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: 6, borderRadius: 4, fontSize: 12, marginTop: 6 };

export default function DocumentsPanel({ nodeId }: { nodeId: number }) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<{ id: number; content: any[] } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Latest unsaved content (kept in a ref so typing doesn't re-render the list)
  const pending = useRef<{ id: number; content: any[] } | null>(null);

  // Load this node's document list
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_URL}/api/mindmap/node/${nodeId}/documents`)
      .then(r => (r.ok ? r.json() : []))
      .then((list: DocSummary[]) => {
        if (cancelled) return;
        setDocs(list);
        setActiveId(prev => prev ?? list[0]?.id ?? null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [nodeId]);

  // Load the selected document's content
  useEffect(() => {
    if (activeId == null) return;
    let cancelled = false;
    fetch(`${API_URL}/api/mindmap/documents/${activeId}`)
      .then(r => (r.ok ? r.json() : null))
      .then(doc => {
        if (!cancelled) setLoaded({ id: activeId, content: Array.isArray(doc?.content) ? doc.content : [] });
      })
      .catch(() => { if (!cancelled) setLoaded({ id: activeId, content: [] }); });
    return () => { cancelled = true; };
  }, [activeId]);

  // Send unsaved edits to the backend
  const save = useCallback(async () => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    setSaveState('saving');
    try {
      const res = await fetch(`${API_URL}/api/mindmap/documents/${p.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: p.content }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setSaveState(pending.current ? 'unsaved' : 'saved');
    } catch {
      // Put it back so the next save retries it
      if (!pending.current) pending.current = p;
      setSaveState('error');
    }
  }, []);

  // Ctrl+S, safety-net save, warn before closing the tab, save when the panel closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current) { e.preventDefault(); e.returnValue = ''; }
    };
    const timer = setInterval(save, SAFETY_SAVE_MS);
    window.addEventListener('keydown', onKey);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('beforeunload', onBeforeUnload);
      save();
    };
  }, [save]);

  const handleChange = useCallback((docId: number, content: any[]) => {
    pending.current = { id: docId, content };
    setSaveState('unsaved');
  }, []);

  const selectDoc = async (id: number) => {
    if (id === activeId) return;
    await save();
    setActiveId(id);
  };

  const createDoc = async () => {
    const title = newTitle.trim() || 'Untitled';
    const groupName = newGroup.trim() || 'General';
    try {
      const res = await fetch(`${API_URL}/api/mindmap/node/${nodeId}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, groupName }),
      });
      if (res.ok) {
        const doc: DocSummary = await res.json();
        await save();
        setDocs(prev => [...prev, doc]);
        setActiveId(doc.id);
      }
    } catch {}
    setShowNew(false);
    setNewTitle('');
  };

  const commitRename = async (id: number) => {
    const title = renameValue.trim();
    setRenamingId(null);
    if (!title) return;
    setDocs(prev => prev.map(d => (d.id === id ? { ...d, title } : d)));
    try {
      await fetch(`${API_URL}/api/mindmap/documents/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });
    } catch {}
  };

  const deleteDoc = async (id: number) => {
    if (!confirm('Delete this document?')) return;
    if (pending.current?.id === id) {
      pending.current = null;
      setSaveState('saved');
    }
    try { await fetch(`${API_URL}/api/mindmap/documents/${id}`, { method: 'DELETE' }); } catch {}
    const next = docs.filter(d => d.id !== id);
    setDocs(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
  };

  const groups = Array.from(new Set(docs.map(d => d.group_name || 'General')));

  const statusText: Record<SaveState, string> = {
    saved: 'All changes saved',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    error: 'Save failed — click Save to retry',
  };
  const statusColor: Record<SaveState, string> = {
    saved: '#666', unsaved: '#f59e0b', saving: '#888', error: '#ef4444',
  };

  return (
    <div style={{ display: 'flex', height: '100%', background: '#1e1e1e', color: '#ccc' }}>
      {/* Document list */}
      <div style={{ width: 210, flexShrink: 0, borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 8, borderBottom: '1px solid #333' }}>
          <button onClick={() => setShowNew(s => !s)} style={{ ...smallBtn, width: '100%' }}>+ New document</button>
          {showNew && (
            <div>
              <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') createDoc(); }}
                placeholder="Title" style={inputStyle} />
              <input value={newGroup} onChange={e => setNewGroup(e.target.value)} list="doc-groups"
                onKeyDown={e => { if (e.key === 'Enter') createDoc(); }}
                placeholder="Group (e.g. Chapter 1)" style={inputStyle} />
              <datalist id="doc-groups">{groups.map(g => <option key={g} value={g} />)}</datalist>
              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                <button onClick={createDoc} style={{ ...smallBtn, background: '#0070f3', color: '#fff', flex: 1 }}>Create</button>
                <button onClick={() => setShowNew(false)} style={{ ...smallBtn, flex: 1 }}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {docs.length === 0 && (
            <div style={{ padding: 12, color: '#666', fontSize: 12 }}>No documents yet.</div>
          )}
          {groups.map(g => (
            <div key={g}>
              <div onClick={() => setCollapsed(c => ({ ...c, [g]: !c[g] }))}
                style={{ padding: '6px 10px', fontSize: 11, color: '#888', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}>
                {collapsed[g] ? '▸' : '▾'} {g}
              </div>
              {!collapsed[g] && docs.filter(d => (d.group_name || 'General') === g).map(d => (
                <div key={d.id} onClick={() => selectDoc(d.id)}
                  onDoubleClick={() => { setRenamingId(d.id); setRenameValue(d.title); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px 6px 20px',
                    cursor: 'pointer', fontSize: 13,
                    background: d.id === activeId ? '#2a2d3e' : 'transparent',
                    color: d.id === activeId ? '#fff' : '#ccc',
                  }}>
                  {renamingId === d.id ? (
                    <input autoFocus value={renameValue} onChange={e => setRenameValue(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onBlur={() => commitRename(d.id)}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(d.id); if (e.key === 'Escape') setRenamingId(null); }}
                      style={{ ...inputStyle, marginTop: 0 }} />
                  ) : (
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title="Double-click to rename">{d.title}</span>
                  )}
                  <button onClick={e => { e.stopPropagation(); deleteDoc(d.id); }}
                    style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 11 }}>✕</button>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Save bar */}
        <div style={{ padding: 8, borderTop: '1px solid #333', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={save} disabled={saveState === 'saved' || saveState === 'saving'}
            title="Save (Ctrl+S)"
            style={{
              ...smallBtn,
              background: saveState === 'unsaved' || saveState === 'error' ? '#0070f3' : '#333',
              color: saveState === 'unsaved' || saveState === 'error' ? '#fff' : '#777',
              cursor: saveState === 'unsaved' || saveState === 'error' ? 'pointer' : 'default',
            }}>
            💾 Save
          </button>
          <span style={{ fontSize: 11, color: statusColor[saveState] }}>{statusText[saveState]}</span>
        </div>
      </div>

      {/* Editor */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeId == null ? (
          <div style={{ padding: 30, color: '#666' }}>Create a document to start writing.</div>
        ) : loaded && loaded.id === activeId ? (
          <BlockEditor
            key={loaded.id}
            initialContent={loaded.content}
            onChange={content => handleChange(loaded.id, content)}
            apiUrl={API_URL}
          />
        ) : (
          <div style={{ padding: 20, color: '#666' }}>Loading document...</div>
        )}
      </div>
    </div>
  );
}