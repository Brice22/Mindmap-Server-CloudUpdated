'use client';

// ============================================================
// 🧠 MIND MAP COLLECTIONS - named groups of nodes
// ============================================================
// A collection is a hand-picked set of nodes (a book's chapters, your goals,
// a course…). A node can be in any number of collections.
//   - + New Collection, or a Quick Start template (a ready name + icon)
//   - click a collection → its nodes; + Add nodes, × to take one out
//   - "with sub-nodes" adds a node and everything under it in one go
//   - 🗺 Show in graph lights up just these nodes on the Graph
//   - from the Graph: right-click a node → 📋 Add to collection…
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import type { Node, MindmapCollection } from '@/lib/types';

// Quick Start: a ready-made name, icon and description — then add your nodes
const DEFAULT_TEMPLATES = [
  { name: 'Family Tree', icon: '🌳', description: 'People in the family and how they connect' },
  { name: 'Goals', icon: '🎯', description: 'Long-term objectives and milestones' },
  { name: 'Daily Journal', icon: '📓', description: 'Your journal nodes' },
  { name: 'Dream Journal', icon: '🌙', description: 'Record and track your dreams' },
  { name: 'Health & Nutrition', icon: '🏥', description: 'Health notes, plans and research' },
  { name: 'Lesson Plans', icon: '📚', description: 'Curriculum, courses and study materials' },
  { name: 'Study Deck', icon: '🧪', description: 'Topics you are studying right now' },
];
const ICONS = ['📋', '🌳', '🎯', '📓', '🌙', '🏥', '💼', '📚', '🧪', '🗺️', '💡', '🔬', '📖', '⚔️', '🏛️', '💰'];

interface MindmapHubProps {
  collections: MindmapCollection[];
  nodes: Node[];
  onCreateCollection: (collection: MindmapCollection) => Promise<MindmapCollection | void> | MindmapCollection | void;
  onUpdateCollection: (id: string, patch: Partial<MindmapCollection>) => Promise<void> | void;
  onDeleteCollection: (id: string) => void | Promise<void>;
  onOpenNode: (node: Node) => void;                 // show the node in the Graph + Inspector
  onShowInGraph: (collection: MindmapCollection) => void;
}

const metaOf = (n: Node): any => (typeof n.metadata === 'string' ? JSON.parse((n.metadata as any) || '{}') : n.metadata || {});
const btn: React.CSSProperties = { border: 'none', padding: '7px 14px', borderRadius: 5, cursor: 'pointer', fontSize: 13 };
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: 8, borderRadius: 4, fontSize: 13 };
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 };
const box: React.CSSProperties = { background: '#2a2a3a', borderRadius: 8, padding: 24, width: 480, maxWidth: '94vw', border: '1px solid #444', maxHeight: '85vh', overflow: 'auto', color: '#ccc' };

// Each node's sub-nodes (children find their parent by name)
function useChildren(nodes: Node[]) {
  return useMemo(() => {
    const byName = new Map(nodes.map(n => [n.name.toLowerCase(), n.id]));
    const kids = new Map<number, number[]>();
    for (const n of nodes) {
      const p = String(metaOf(n).parent || '').toLowerCase();
      const pid = p ? byName.get(p) : undefined;
      if (pid != null && pid !== n.id) kids.set(pid, [...(kids.get(pid) || []), n.id]);
    }
    return kids;
  }, [nodes]);
}
function withDescendants(id: number, kids: Map<number, number[]>): number[] {
  const out: number[] = [], seen = new Set<number>(), stack = [id];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur); out.push(cur);
    stack.push(...(kids.get(cur) || []));
  }
  return out;
}

// ------------------------------------------------------------
// Pick nodes: search all of them, tick to add, or add a node with everything under it
// ------------------------------------------------------------
function NodePicker({ nodes, selected, onChange }: { nodes: Node[]; selected: number[]; onChange: (ids: number[]) => void }) {
  const [q, setQ] = useState('');
  const kids = useChildren(nodes);
  const sel = useMemo(() => new Set(selected), [selected]);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = s ? nodes.filter(n => n.name.toLowerCase().includes(s) || (n.description || '').toLowerCase().includes(s)) : nodes;
    return [...list].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 60);
  }, [nodes, q]);
  const toggle = (id: number) => onChange(sel.has(id) ? selected.filter(x => x !== id) : [...selected, id]);
  const addTree = (id: number) => onChange(Array.from(new Set([...selected, ...withDescendants(id, kids)])));

  return (
    <div>
      <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search nodes…" aria-label="Search nodes" style={{ ...field, marginBottom: 6 }} autoFocus />
      <div style={{ fontSize: 11, color: '#777', marginBottom: 4 }}>
        {selected.length} picked{matches.length === 60 ? ' · showing the first 60 matches — type to narrow' : ''}
      </div>
      <div style={{ maxHeight: 260, overflow: 'auto', border: '1px solid #333', borderRadius: 4 }}>
        {matches.length === 0 && <div style={{ padding: 10, color: '#666', fontSize: 13 }}>No nodes match.</div>}
        {matches.map(n => {
          const sub = withDescendants(n.id, kids).length - 1;
          const parent = metaOf(n).parent;
          return (
            <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', fontSize: 13, borderBottom: '1px solid #2c2c3c' }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, cursor: 'pointer', color: sel.has(n.id) ? '#fff' : '#ccc', minWidth: 0 }}>
                <input type="checkbox" checked={sel.has(n.id)} onChange={() => toggle(n.id)} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.name}</span>
                {parent && <span style={{ color: '#666', fontSize: 11, whiteSpace: 'nowrap' }}>in {parent}</span>}
              </label>
              {sub > 0 && (
                <button onClick={() => addTree(n.id)} title={`Add ${n.name} and the ${sub} node(s) under it`}
                  style={{ background: 'none', border: '1px solid #444', color: '#9ab', borderRadius: 4, padding: '1px 6px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  + with {sub} sub-node{sub === 1 ? '' : 's'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// New / edit dialog
// ------------------------------------------------------------
function CollectionDialog({ title, initial, nodes, showNodes, onSave, onClose }: {
  title: string; initial: { name: string; icon: string; description: string; nodeIds: number[] }; nodes: Node[];
  showNodes: boolean; onSave: (v: { name: string; icon: string; description: string; nodeIds: number[] }) => void; onClose: () => void;
}) {
  const [v, setV] = useState(initial);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const ok = !!v.name.trim();
  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box} role="dialog" aria-label={title}>
        <h3 style={{ color: '#fff', marginTop: 0 }}>{title}</h3>
        <label style={{ color: '#aaa', fontSize: 12 }}>Name</label>
        <input value={v.name} onChange={e => setV({ ...v, name: e.target.value })} placeholder="e.g. Career Goals" aria-label="Collection name"
          style={{ ...field, margin: '4px 0 12px' }} />
        <label style={{ color: '#aaa', fontSize: 12 }}>Icon</label>
        <div style={{ display: 'flex', gap: 6, margin: '4px 0 12px', flexWrap: 'wrap' }}>
          {ICONS.map(icon => (
            <button key={icon} onClick={() => setV({ ...v, icon })}
              style={{ background: v.icon === icon ? '#0070f3' : '#333', border: 'none', fontSize: 20, padding: 6, borderRadius: 4, cursor: 'pointer' }}>{icon}</button>
          ))}
        </div>
        <label style={{ color: '#aaa', fontSize: 12 }}>Description (optional)</label>
        <input value={v.description} onChange={e => setV({ ...v, description: e.target.value })} placeholder="What is this collection for?" aria-label="Collection description"
          style={{ ...field, margin: '4px 0 12px' }} />
        {showNodes && (
          <>
            <label style={{ color: '#aaa', fontSize: 12 }}>Nodes (optional — you can add more any time)</label>
            <div style={{ marginTop: 4, marginBottom: 16 }}>
              <NodePicker nodes={nodes} selected={v.nodeIds} onChange={nodeIds => setV({ ...v, nodeIds })} />
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ ...btn, background: '#333', color: '#ccc' }}>Cancel</button>
          <button onClick={() => ok && onSave({ ...v, name: v.name.trim() })} disabled={!ok}
            style={{ ...btn, background: ok ? '#0070f3' : '#333', color: ok ? '#fff' : '#777' }}>Save</button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
export default function MindmapHub({ collections, nodes, onCreateCollection, onUpdateCollection, onDeleteCollection, onOpenNode, onShowInGraph }: MindmapHubProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'new' | 'edit'>(null);
  const [adding, setAdding] = useState<number[] | null>(null);    // the "+ Add nodes" picker (its current picks)
  const [filter, setFilter] = useState('');

  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const open = collections.find(c => c.id === openId) || null;
  // Deleted nodes drop out of the list by themselves
  const members = useMemo(() => (open ? open.nodeIds.map(id => byId.get(id)).filter(Boolean) as Node[] : []), [open, byId]);
  const count = (c: MindmapCollection) => c.nodeIds.filter(id => byId.has(id)).length;

  const create = async (v: { name: string; icon: string; description: string; nodeIds: number[] }, thenAdd = false) => {
    const saved = await onCreateCollection({ id: `mc-${Date.now()}`, ...v, createdAt: new Date().toISOString() });
    setDialog(null);
    if (saved && (saved as MindmapCollection).id) {
      setOpenId((saved as MindmapCollection).id);
      if (thenAdd) setAdding([]);
    }
  };

  const remove = (id: number) => open && onUpdateCollection(open.id, { nodeIds: open.nodeIds.filter(x => x !== id) });

  // ---------- one collection ----------
  if (open) {
    const shown = filter.trim()
      ? members.filter(n => n.name.toLowerCase().includes(filter.trim().toLowerCase()))
      : members;
    return (
      <div style={{ padding: 24, height: '100%', overflow: 'auto', background: '#1e1e2e', color: '#ccc' }}>
        <button onClick={() => { setOpenId(null); setFilter(''); }} style={{ ...btn, background: 'none', color: '#888', padding: 0, marginBottom: 12 }}>← All collections</button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <div>
            <h2 style={{ color: '#fff', margin: 0 }}>{open.icon} {open.name}</h2>
            <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>{members.length} node{members.length === 1 ? '' : 's'}{open.description ? ` · ${open.description}` : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => setAdding([])} style={{ ...btn, background: '#0070f3', color: '#fff' }}>+ Add nodes</button>
            <button onClick={() => onShowInGraph(open)} disabled={!members.length} style={{ ...btn, background: '#333', color: members.length ? '#ccc' : '#666' }}>🗺 Show in graph</button>
            <button onClick={() => setDialog('edit')} style={{ ...btn, background: '#333', color: '#ccc' }}>✏️ Edit</button>
            <button onClick={() => { if (confirm(`Delete the collection "${open.name}"? (Its nodes stay — only the group goes.)`)) { onDeleteCollection(open.id); setOpenId(null); } }}
              style={{ ...btn, background: '#333', color: '#f87171' }}>Delete</button>
          </div>
        </div>

        {members.length > 8 && (
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter this collection…" aria-label="Filter collection" style={{ ...field, maxWidth: 320, marginBottom: 10 }} />
        )}
        {members.length === 0 ? (
          <div style={{ background: '#2a2a3a', borderRadius: 8, padding: 24, textAlign: 'center', color: '#888', lineHeight: 1.6 }}>
            No nodes yet. Press <b style={{ color: '#ccc' }}>+ Add nodes</b>, or on the Graph right-click a node → <b style={{ color: '#ccc' }}>📋 Add to collection…</b>
          </div>
        ) : (
          <div style={{ background: '#2a2a3a', borderRadius: 8, overflow: 'hidden' }}>
            {[...shown].sort((a, b) => a.name.localeCompare(b.name)).map(n => {
              const parent = metaOf(n).parent;
              return (
                <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #333' }}>
                  <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => onOpenNode(n)} title="Open on the Graph">
                    <div style={{ color: '#fff', fontSize: 14 }}>{n.name}{parent && <span style={{ color: '#666', fontSize: 11, marginLeft: 8 }}>in {parent}</span>}</div>
                    {n.description && <div style={{ color: '#777', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.description}</div>}
                  </div>
                  <button onClick={() => remove(n.id)} title="Take out of this collection (the node stays)" aria-label={`Remove ${n.name}`}
                    style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16 }}>×</button>
                </div>
              );
            })}
          </div>
        )}

        {adding && (
          <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) setAdding(null); }}>
            <div style={box} role="dialog" aria-label="Add nodes">
              <h3 style={{ color: '#fff', marginTop: 0 }}>Add nodes to {open.icon} {open.name}</h3>
              <NodePicker nodes={nodes.filter(n => !open.nodeIds.includes(n.id))} selected={adding} onChange={setAdding} />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
                <button onClick={() => setAdding(null)} style={{ ...btn, background: '#333', color: '#ccc' }}>Cancel</button>
                <button disabled={!adding.length} onClick={async () => { await onUpdateCollection(open.id, { nodeIds: [...open.nodeIds, ...adding] }); setAdding(null); }}
                  style={{ ...btn, background: adding.length ? '#0070f3' : '#333', color: adding.length ? '#fff' : '#777' }}>
                  Add {adding.length || ''}
                </button>
              </div>
            </div>
          </div>
        )}
        {dialog === 'edit' && (
          <CollectionDialog title="Edit collection" nodes={nodes} showNodes={false}
            initial={{ name: open.name, icon: open.icon, description: open.description || '', nodeIds: open.nodeIds }}
            onClose={() => setDialog(null)}
            onSave={async v => { await onUpdateCollection(open.id, { name: v.name, icon: v.icon, description: v.description }); setDialog(null); }} />
        )}
      </div>
    );
  }

  // ---------- all collections ----------
  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto', background: '#1e1e2e' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h2 style={{ color: '#fff', margin: 0 }}>Mindmap Collections</h2>
        <button onClick={() => setDialog('new')} style={{ ...btn, background: '#0070f3', color: '#fff', fontSize: 14, padding: '8px 16px' }}>+ New Collection</button>
      </div>

      {collections.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <h3 style={{ color: '#aaa', fontSize: 13, textTransform: 'uppercase', marginBottom: 12 }}>Your Collections</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
            {collections.map(col => (
              <div key={col.id} onClick={() => setOpenId(col.id)} role="button" aria-label={`Open ${col.name}`}
                style={{ background: '#2a2a3a', padding: 16, borderRadius: 8, cursor: 'pointer', border: '1px solid #444', position: 'relative' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#0070f3')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#444')}>
                <div style={{ fontSize: 28, marginBottom: 8 }}>{col.icon}</div>
                <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: 4 }}>{col.name}</div>
                <div style={{ color: '#888', fontSize: 12 }}>{count(col)} node{count(col) === 1 ? '' : 's'} · open to add</div>
                <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>{col.description || ''}</div>
                {col.mapOverlay && <div style={{ color: '#0070f3', fontSize: 11, marginTop: 4 }}>🗺️ Map overlay</div>}
                <button aria-label={`Delete ${col.name}`}
                  onClick={e => { e.stopPropagation(); if (confirm(`Delete the collection "${col.name}"? (Its nodes stay.)`)) onDeleteCollection(col.id); }}
                  style={{ position: 'absolute', top: 8, right: 8, background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: 14 }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <h3 style={{ color: '#aaa', fontSize: 13, textTransform: 'uppercase', marginBottom: 4 }}>Quick Start Templates</h3>
      <div style={{ color: '#666', fontSize: 12, marginBottom: 12 }}>A ready name and icon — it opens straight away so you can add your nodes.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {DEFAULT_TEMPLATES.filter(t => !collections.some(c => c.name === t.name)).map(t => (
          <div key={t.name} onClick={() => create({ name: t.name, icon: t.icon, description: t.description, nodeIds: [] }, true)} role="button" aria-label={`Start ${t.name}`}
            style={{ background: '#222233', padding: 16, borderRadius: 8, cursor: 'pointer', border: '1px dashed #555', textAlign: 'center' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#0070f3')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = '#555')}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>{t.icon}</div>
            <div style={{ color: '#ccc', fontWeight: 'bold', marginBottom: 4 }}>{t.name}</div>
            <div style={{ color: '#666', fontSize: 12 }}>{t.description}</div>
          </div>
        ))}
      </div>

      {dialog === 'new' && (
        <CollectionDialog title="New Mindmap Collection" nodes={nodes} showNodes
          initial={{ name: '', icon: '📋', description: '', nodeIds: [] }}
          onClose={() => setDialog(null)} onSave={v => create(v)} />
      )}
    </div>
  );
}