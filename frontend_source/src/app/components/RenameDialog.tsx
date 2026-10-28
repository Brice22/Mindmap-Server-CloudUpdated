'use client';

// ============================================================
// ✏️ RENAME A NODE - right-click → Rename…, the ✏️ beside the name in
// the Inspector, or F2 on the selected node
// ============================================================
// Names are unique (any case): sub-nodes find their parent by name, so a
// rename carries over to them on the server, along with bookmarks and
// question labels. Docs, files, cards, links and @mentions stay attached
// (they use the node's id), and the old name is kept as an alias so text
// that still says it keeps linking here.
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Node } from '@/lib/types';

interface Props {
  apiUrl: string;
  node: Node;
  allNodes: Node[];
  onClose: () => void;
  onRenamed: (newName: string) => void;
}

const metaOf = (n: Node): any => (typeof n.metadata === 'string' ? JSON.parse(n.metadata || '{}') : n.metadata || {});
const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 };
const box: React.CSSProperties = { background: '#2a2a3a', padding: 20, borderRadius: 8, width: 440, maxWidth: '94vw', border: '1px solid #444', color: '#ccc', fontSize: 13 };
const btn: React.CSSProperties = { border: 'none', padding: '7px 14px', borderRadius: 5, cursor: 'pointer', fontSize: 13 };

export default function RenameDialog({ apiUrl, node, allNodes, onClose, onRenamed }: Props) {
  const [name, setName] = useState(node.name);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.select(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const clean = name.trim().replace(/\s+/g, ' ');
  const taken = useMemo(() => allNodes.find(n => n.id !== node.id && n.name.toLowerCase() === clean.toLowerCase()), [allNodes, node.id, clean]);
  const children = useMemo(() => allNodes.filter(n => String(metaOf(n).parent || '').toLowerCase() === node.name.toLowerCase()).length, [allNodes, node.name]);
  const problem = !clean ? 'Give it a name' : taken ? `"${taken.name}" already exists — names must be unique` : '';
  const unchanged = clean === node.name;

  const save = async () => {
    if (problem || unchanged) { if (unchanged) onClose(); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch(`${apiUrl}/api/mindmap/node/${node.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: clean }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || `Rename failed (${r.status})`);
      onRenamed(clean);
      onClose();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box} role="dialog" aria-label="Rename node">
        <h3 style={{ color: '#fff', margin: '0 0 12px' }}>✏️ Rename</h3>
        <input ref={input} value={name} onChange={e => setName(e.target.value)} maxLength={200}
          onKeyDown={e => { if (e.key === 'Enter') save(); }} aria-label="New name"
          style={{ width: '100%', boxSizing: 'border-box', background: '#1e1e2e', color: '#fff', border: `1px solid ${problem && !unchanged ? '#f87171' : '#444'}`, borderRadius: 4, padding: '8px 10px', fontSize: 14 }} />
        <div style={{ minHeight: 18, marginTop: 6, fontSize: 12, color: problem ? '#f87171' : '#888' }}>
          {problem || (children ? `Its ${children} sub-node${children === 1 ? '' : 's'} will follow the new name; docs, files, questions and links stay attached.` : 'Docs, files, questions and links stay attached.')}
        </div>
        {error && <div style={{ color: '#f87171', marginTop: 4 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button onClick={onClose} style={{ ...btn, background: '#333', color: '#ccc' }}>Cancel</button>
          <button onClick={save} disabled={saving || !!problem || unchanged}
            style={{ ...btn, background: problem || unchanged ? '#333' : '#0070f3', color: problem || unchanged ? '#777' : '#fff' }}>{saving ? 'Renaming…' : 'Rename'}</button>
        </div>
      </div>
    </div>
  );
}