'use client';

// ============================================================
// DOCUMENTS PANEL - shared document library, opened from a node
// ============================================================
// Left: the node's documents
//   - This node: documents made here, sorted into named groups
//   - 🔗 Linked: documents from elsewhere that you linked to this node
//   - 👪 Family: documents of the parent node and child nodes
// Right: the selected document in the BlockNote editor
//
// A document has one "home" node (where it was made). Deleting that
// node keeps the document as "Unfiled" — find it with 🔗 Link existing.
// Editing a linked/family document edits the same document everywhere.
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

type Relation = 'home' | 'linked' | 'family';

interface DocSummary {
  id: number;
  node_id: number | null;        // home node (null = Unfiled)
  group_name: string;
  title: string;
  sort_order?: number;
  relation?: Relation;           // how this document relates to the open node
  home_node_name?: string | null;
}

interface LibraryDoc {
  id: number;
  node_id: number | null;
  group_name: string;
  title: string;
  home_node_name: string | null;
  link_count: number;
}

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

const smallBtn: React.CSSProperties = { background: '#333', border: 'none', color: '#ccc', padding: '6px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 };
const inputStyle: React.CSSProperties = { width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: 6, borderRadius: 4, fontSize: 12, marginTop: 6 };
const sectionStyle: React.CSSProperties = { padding: '6px 10px', fontSize: 11, color: '#888', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' };

// One-time import: turn data from the retired Table/Chart windows into document blocks
interface LegacyData { tableData?: any; chartConfig?: any }

function legacyToBlocks(legacy?: LegacyData): any[] {
  if (!legacy) return [];
  const blocks: any[] = [];
  const t = legacy.tableData;
  if (t?.headers?.length) {
    blocks.push({ type: 'heading', props: { level: 3 }, content: 'Table' });
    blocks.push({
      type: 'table',
      content: {
        type: 'tableContent',
        headerRows: 1,
        rows: [t.headers, ...(t.rows || [])].map((r: any[]) => ({ cells: r.map(c => String(c ?? '')) })),
      },
    });
  }
  const c = legacy.chartConfig;
  if (c) {
    const cj = c.chartjsConfig;
    if (cj?.data?.labels?.length) {
      const clean = (v: any) => String(v ?? '').replace(/[,\t\n]/g, ' ');
      const ds: any[] = cj.data.datasets || [];
      const header = ['Label', ...ds.map((d, i) => clean(d.label || `Series ${i + 1}`))].join(', ');
      const rows = cj.data.labels.map((l: any, i: number) => [clean(l), ...ds.map(d => Number(d.data?.[i]) || 0)].join(', '));
      blocks.push({ type: 'heading', props: { level: 3 }, content: 'Chart' });
      blocks.push({
        type: 'chart',
        props: {
          chartType: ['bar', 'line', 'pie', 'doughnut', 'radar'].includes(cj.type) ? cj.type : 'bar',
          title: String(cj.options?.plugins?.title?.text || ''),
          data: [header, ...rows].join('\n'),
        },
      });
    }
    for (const url of [c.desmosUrl, c.geogebraUrl, c.customUrl]) {
      if (url) blocks.push({ type: 'embed', props: { url } });
    }
  }
  if (blocks.length) blocks.unshift({ type: 'paragraph', content: 'Imported automatically from the old Table/Chart windows.' });
  return blocks;
}

interface DocumentsPanelProps {
  nodeId: number;
  legacy?: LegacyData;              // old Table/Chart data to import once
  onLegacyImported?: () => void;    // called after the import document is created
}

export default function DocumentsPanel({ nodeId, legacy, onLegacyImported }: DocumentsPanelProps) {
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState<{ id: number; content: any[] } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({ __family: true });
  const [showNew, setShowNew] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGroup, setNewGroup] = useState('');
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // "Link existing document" picker
  const [showLink, setShowLink] = useState(false);
  const [linkSearch, setLinkSearch] = useState('');
  const [library, setLibrary] = useState<LibraryDoc[]>([]);

  // Latest unsaved content (kept in a ref so typing doesn't re-render the list)
  const pending = useRef<{ id: number; content: any[] } | null>(null);

  // Import old Table/Chart data at most once, even though React runs this effect twice in dev
  const importPromise = useRef<Promise<void> | null>(null);

  const loadList = useCallback(async () => {
    const r = await fetch(`${API_URL}/api/mindmap/node/${nodeId}/documents`);
    return (r.ok ? await r.json() : []) as DocSummary[];
  }, [nodeId]);

  // Load this node's document list
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const legacyBlocks = legacyToBlocks(legacy);
      if (legacyBlocks.length && !importPromise.current) {
        importPromise.current = fetch(`${API_URL}/api/mindmap/node/${nodeId}/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: 'Imported (old Table/Chart)', groupName: 'General', content: legacyBlocks }),
        })
          .then(res => { if (res.ok) onLegacyImported?.(); })
          .catch(() => {});
      }
      if (importPromise.current) await importPromise.current;
      try {
        const list = await loadList();
        if (cancelled) return;
        setDocs(list);
        // Reopen the document you had open last time (remembered in this browser)
        let remembered: number | null = null;
        try { remembered = Number(localStorage.getItem(`hserver:doc:${nodeId}`)) || null; } catch {}
        setActiveId(prev => prev ?? (list.some(d => d.id === remembered) ? remembered : list[0]?.id ?? null));
    } catch {}
    })();
    return () => { cancelled = true; };
  }, [nodeId]);

    // Remember which document is open for this node
  useEffect(() => {
    if (activeId == null) return;
    try { localStorage.setItem(`hserver:doc:${nodeId}`, String(activeId)); } catch {}
  }, [activeId, nodeId]);

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

  // Search the whole library while the picker is open
  useEffect(() => {
    if (!showLink) return;
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`${API_URL}/api/mindmap/documents?search=${encodeURIComponent(linkSearch)}`)
        .then(r => (r.ok ? r.json() : []))
        .then((list: LibraryDoc[]) => { if (!cancelled) setLibrary(list); })
        .catch(() => {});
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [showLink, linkSearch]);

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
        setDocs(prev => [...prev, { ...doc, relation: 'home' }]);
        setActiveId(doc.id);
      }
    } catch {}
    setShowNew(false);
    setNewTitle('');
  };

  // Link a document from the library to this node, or adopt an Unfiled one as this node's own
  const linkDoc = async (doc: LibraryDoc, adopt: boolean) => {
    try {
      if (adopt) {
        await fetch(`${API_URL}/api/mindmap/documents/${doc.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nodeId }),
        });
      } else {
        await fetch(`${API_URL}/api/mindmap/node/${nodeId}/documents/link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ documentId: doc.id }),
        });
      }
      await save();
      setDocs(await loadList());
      setActiveId(doc.id);
    } catch {}
    setShowLink(false);
    setLinkSearch('');
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

  // Home documents are deleted (everywhere); linked documents are only unlinked from this node
  const removeDoc = async (doc: DocSummary) => {
    const isHome = doc.relation === 'home';
    const question = isHome
      ? `Move "${doc.title}" to the Trash? It also disappears from nodes that link to it. You can restore it for 30 days.`
    : `Unlink "${doc.title}" from this node? The document itself is kept.`;
    if (!confirm(question)) return;
    if (pending.current?.id === doc.id) {
      if (isHome) { pending.current = null; setSaveState('saved'); } else { await save(); }
    }
    try {
      await fetch(
        isHome
          ? `${API_URL}/api/mindmap/documents/${doc.id}`
          : `${API_URL}/api/mindmap/node/${nodeId}/documents/link/${doc.id}`,
        { method: 'DELETE' },
      );
    } catch {}
    const next = docs.filter(d => d.id !== doc.id);
    setDocs(next);
    if (activeId === doc.id) setActiveId(next[0]?.id ?? null);
  };

  const homeDocs = docs.filter(d => (d.relation || 'home') === 'home');
  const linkedDocs = docs.filter(d => d.relation === 'linked');
  const familyDocs = docs.filter(d => d.relation === 'family');
  const groups = Array.from(new Set(homeDocs.map(d => d.group_name || 'General')));
  const shownIds = new Set(docs.map(d => d.id));
  const activeDoc = docs.find(d => d.id === activeId);

  const statusText: Record<SaveState, string> = {
    saved: 'All changes saved',
    unsaved: 'Unsaved changes',
    saving: 'Saving…',
    error: 'Save failed — click Save to retry',
  };
  const statusColor: Record<SaveState, string> = {
    saved: '#666', unsaved: '#f59e0b', saving: '#888', error: '#ef4444',
  };

  // One row in the document list
  const renderDoc = (d: DocSummary, subtitle?: string, removable = true) => (
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
        <span style={{ flex: 1, overflow: 'hidden' }} title="Double-click to rename">
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</span>
          {subtitle && <span style={{ display: 'block', fontSize: 10, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span>}
        </span>
      )}
      {removable && (
        <button onClick={e => { e.stopPropagation(); removeDoc(d); }}
          title={d.relation === 'linked' ? 'Unlink from this node' : 'Delete document'}
          style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 11 }}>
          {d.relation === 'linked' ? '⛓' : '✕'}
        </button>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100%', background: '#1e1e1e', color: '#ccc' }}>
      {/* Document list */}
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 8, borderBottom: '1px solid #333' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => { setShowNew(s => !s); setShowLink(false); }} style={{ ...smallBtn, flex: 1 }}>+ New</button>
            <button onClick={() => { setShowLink(s => !s); setShowNew(false); }} style={{ ...smallBtn, flex: 1 }}>🔗 Link existing</button>
          </div>
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
          {showLink && (
            <div>
              <input autoFocus value={linkSearch} onChange={e => setLinkSearch(e.target.value)}
                placeholder="Search all documents…" style={inputStyle} />
              <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 6, border: '1px solid #333', borderRadius: 4 }}>
                {library.filter(d => !shownIds.has(d.id)).length === 0 && (
                  <div style={{ padding: 8, fontSize: 11, color: '#666' }}>No other documents found.</div>
                )}
                {library.filter(d => !shownIds.has(d.id)).map(d => (
                  <div key={d.id} style={{ padding: '6px 8px', borderBottom: '1px solid #2a2a2a', fontSize: 12 }}>
                    <div style={{ color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                    <div style={{ fontSize: 10, color: d.node_id == null ? '#f59e0b' : '#666' }}>
                      {d.node_id == null ? 'Unfiled (its node was deleted)' : `from ${d.home_node_name}`}
                    </div>
                    <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                      <button onClick={() => linkDoc(d, false)} style={{ ...smallBtn, padding: '2px 8px', fontSize: 11 }}>Link</button>
                      {d.node_id == null && (
                        <button onClick={() => linkDoc(d, true)} title="Make this node its new home"
                          style={{ ...smallBtn, padding: '2px 8px', fontSize: 11 }}>Move here</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {docs.length === 0 && (
            <div style={{ padding: 12, color: '#666', fontSize: 12 }}>No documents yet.</div>
          )}

          {/* This node's own documents, by group */}
          {groups.map(g => (
            <div key={g}>
              <div onClick={() => setCollapsed(c => ({ ...c, [g]: !c[g] }))} style={sectionStyle}>
                {collapsed[g] ? '▸' : '▾'} {g}
              </div>
              {!collapsed[g] && homeDocs.filter(d => (d.group_name || 'General') === g).map(d => renderDoc(d))}
            </div>
          ))}

          {/* Documents linked here from elsewhere */}
          {linkedDocs.length > 0 && (
            <div>
              <div onClick={() => setCollapsed(c => ({ ...c, __linked: !c.__linked }))} style={sectionStyle}>
                {collapsed.__linked ? '▸' : '▾'} 🔗 Linked ({linkedDocs.length})
              </div>
              {!collapsed.__linked && linkedDocs.map(d =>
                renderDoc(d, d.node_id == null ? 'Unfiled' : `from ${d.home_node_name}`))}
            </div>
          )}

          {/* Parent's and children's documents */}
          {familyDocs.length > 0 && (
            <div>
              <div onClick={() => setCollapsed(c => ({ ...c, __family: !c.__family }))} style={sectionStyle}>
                {collapsed.__family ? '▸' : '▾'} 👪 Family ({familyDocs.length})
              </div>
              {!collapsed.__family && familyDocs.map(d => renderDoc(d, `from ${d.home_node_name}`, false))}
            </div>
          )}
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
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {activeDoc && activeDoc.relation && activeDoc.relation !== 'home' && (
          <div style={{ padding: '4px 12px', fontSize: 11, color: '#888', background: '#252526', borderBottom: '1px solid #333' }}>
            Shared document — {activeDoc.node_id == null ? 'Unfiled' : `home: ${activeDoc.home_node_name}`}. Edits show up everywhere it's linked.
          </div>
        )}
        <div style={{ flex: 1 }}>
          {activeId == null ? (
            <div style={{ padding: 30, color: '#666' }}>Create a document or link an existing one.</div>
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
    </div>
  );
}