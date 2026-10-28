'use client';

// ============================================================
// 📋 ADD TO COLLECTION - right-click a node → 📋 Add to collection…
// ============================================================
// Tick the collections this node belongs in (untick to take it out), or
// make a new collection with it. "with sub-nodes" puts everything under
// the node in too.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import type { Node, MindmapCollection } from '@/lib/types';

interface Props {
  node: Node;
  allNodes: Node[];
  collections: MindmapCollection[];
  onUpdate: (id: string, patch: Partial<MindmapCollection>) => Promise<void> | void;
  onCreate: (collection: MindmapCollection) => Promise<MindmapCollection | void> | MindmapCollection | void;
  onClose: () => void;
}

const metaOf = (n: Node): any => (typeof n.metadata === 'string' ? JSON.parse((n.metadata as any) || '{}') : n.metadata || {});
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 };
const box: React.CSSProperties = { background: '#2a2a3a', padding: 20, borderRadius: 8, width: 400, maxWidth: '94vw', maxHeight: '85vh', overflow: 'auto', border: '1px solid #444', color: '#ccc', fontSize: 13 };
const btn: React.CSSProperties = { border: 'none', padding: '7px 14px', borderRadius: 5, cursor: 'pointer', fontSize: 13 };

export default function AddToCollectionDialog({ node, allNodes, collections, onUpdate, onCreate, onClose }: Props) {
  const [withSub, setWithSub] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [ticking, setTicking] = useState<Record<string, boolean>>({});   // shows the tick at once while it saves

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // The node and everything under it (children find their parent by name)
  const tree = useMemo(() => {
    const out = [node.id], seen = new Set([node.id]);
    for (let i = 0; i < out.length; i++) {
      const name = allNodes.find(n => n.id === out[i])?.name.toLowerCase();
      for (const n of allNodes) {
        if (!seen.has(n.id) && name && String(metaOf(n).parent || '').toLowerCase() === name) { seen.add(n.id); out.push(n.id); }
      }
    }
    return out;
  }, [node, allNodes]);
  const ids = withSub ? tree : [node.id];

  const isIn = (c: MindmapCollection) => ticking[c.id] ?? c.nodeIds.includes(node.id);
  const toggle = async (c: MindmapCollection) => {
    const inIt = c.nodeIds.includes(node.id);
    setBusy(true);
    setTicking(t => ({ ...t, [c.id]: !inIt }));
    await onUpdate(c.id, { nodeIds: inIt ? c.nodeIds.filter(id => !ids.includes(id)) : Array.from(new Set([...c.nodeIds, ...ids])) });
    setTicking(t => { const next = { ...t }; delete next[c.id]; return next; });
    setBusy(false);
  };

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    await onCreate({ id: `mc-${Date.now()}`, name, icon: '📋', description: '', nodeIds: ids, createdAt: new Date().toISOString() });
    setNewName('');
    setBusy(false);
  };

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box} role="dialog" aria-label="Add to collection">
        <h3 style={{ color: '#fff', margin: '0 0 4px' }}>📋 {node.name}</h3>
        <div style={{ color: '#888', marginBottom: 12 }}>Tick the collections it belongs in.</div>

        {tree.length > 1 && (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={withSub} onChange={e => setWithSub(e.target.checked)} />
            Include its {tree.length - 1} sub-node{tree.length === 2 ? '' : 's'}
          </label>
        )}

        <div style={{ border: '1px solid #333', borderRadius: 4, maxHeight: 260, overflow: 'auto', marginBottom: 12 }}>
          {collections.length === 0 && <div style={{ padding: 10, color: '#666' }}>No collections yet — make one below.</div>}
          {collections.map(c => (
            <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px', borderBottom: '1px solid #2c2c3c', cursor: busy ? 'wait' : 'pointer' }}>
              <input type="checkbox" checked={isIn(c)} disabled={busy} onChange={() => toggle(c)} />
              <span style={{ fontSize: 16 }}>{c.icon}</span>
              <span style={{ color: '#fff', flex: 1 }}>{c.name}</span>
              <span style={{ color: '#666', fontSize: 11 }}>{c.nodeIds.length}</span>
            </label>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New collection name…" aria-label="New collection name"
            onKeyDown={e => { if (e.key === 'Enter') create(); }}
            style={{ flex: 1, background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '6px 8px', fontSize: 13 }} />
          <button onClick={create} disabled={!newName.trim() || busy} style={{ ...btn, background: newName.trim() ? '#0070f3' : '#333', color: newName.trim() ? '#fff' : '#777' }}>+ Create</button>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ ...btn, background: '#333', color: '#ccc' }}>Done</button>
        </div>
      </div>
    </div>
  );
}