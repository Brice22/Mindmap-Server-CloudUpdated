'use client';

// ============================================================
// 🔗 LINK DIALOG - add or edit one of your links between two nodes
// ============================================================
// Add:  right-click a node → "🔗 Link to another node…"
//       pick the other node, the link type and (optional) a label
// Edit: right-click the line → change its type or label,
//       ⇄ turn it around, or delete it
// The colours / dashes / arrows come from the link type (🔗 Lines
// legend on the graph → ✎ Edit types).
// ============================================================

import React, { useMemo, useState } from 'react';
import type { Node, LinkType, NodeLink } from '@/lib/types';

interface LinkDialogProps {
  apiUrl: string;
  nodes: Node[];
  types: LinkType[];
  source?: Node;          // adding: the node you right-clicked
  link?: NodeLink;        // editing: the line you right-clicked
  onClose: () => void;
  onSaved: () => void;    // reload links
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const box: React.CSSProperties = { background: '#1e1e2e', border: '1px solid #444', borderRadius: 8, padding: 18, width: 380, maxWidth: 'calc(100vw - 32px)', color: '#ddd', fontSize: 13 };
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#2a2a3c', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '6px 8px', fontSize: 13 };
const btn: React.CSSProperties = { background: '#333', color: '#ddd', border: 'none', borderRadius: 4, padding: '6px 12px', fontSize: 13, cursor: 'pointer' };
const label: React.CSSProperties = { display: 'block', color: '#999', fontSize: 12, margin: '10px 0 4px' };

export default function LinkDialog({ apiUrl, nodes, types, source, link, onClose, onSaved }: LinkDialogProps) {
  const editing = !!link;
  const [fromId, setFromId] = useState<number | null>(link?.sourceId ?? source?.id ?? null);
  const [toId, setToId] = useState<number | null>(link?.targetId ?? null);
  const [typeId, setTypeId] = useState<number | null>(link ? link.typeId : types[0]?.id ?? null);
  const [text, setText] = useState(link?.label || '');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const nameOf = (id: number | null) => nodes.find(n => n.id === id)?.name || '?';
  const type = types.find(t => t.id === typeId);

  // Nodes to pick from (adding only): matching the search, not the node itself
  const choices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return nodes
      .filter(n => n.id !== fromId && (!q || n.name.toLowerCase().includes(q)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 50);
  }, [nodes, fromId, search]);

  const call = async (method: string, path: string, body?: any) => {
    setBusy(true); setError('');
    try {
      const r = await fetch(`${apiUrl}/api/mindmap/${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(Array.isArray(data.message) ? data.message.join(', ') : data.message || `Failed (${r.status})`);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const save = () => {
    if (editing) return call('PUT', `links/${link!.id}`, { typeId, label: text });
    if (!fromId || !toId) return setError('Pick the node to link to');
    return call('POST', 'links', { sourceId: fromId, targetId: toId, typeId, label: text });
  };

  // ⇄ which way the arrow points
  const turnAround = () => {
    if (editing) return call('PUT', `links/${link!.id}`, { reverse: true, typeId, label: text });
    if (toId) { setFromId(toId); setToId(fromId); }
  };

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box} onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
        <div style={{ fontSize: 16, color: '#fff', marginBottom: 6 }}>{editing ? '🔗 Edit link' : '🔗 Link to another node'}</div>

        {/* From → To */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#252536', borderRadius: 6, padding: '8px 10px' }}>
          <b style={{ color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(fromId)}</b>
          <span style={{ color: type?.color || '#9ca3af', fontSize: 16 }}>{type?.arrow ? '→' : '—'}</span>
          <b style={{ color: toId ? '#fff' : '#777', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {toId ? nameOf(toId) : 'pick below'}
          </b>
          <button style={{ ...btn, padding: '3px 8px' }} onClick={turnAround} disabled={busy || !toId} title="Turn the link around">⇄</button>
        </div>

        {!editing && (
          <>
            <span style={label}>Link to</span>
            <input style={field} autoFocus placeholder="Search nodes…" value={search} onChange={e => setSearch(e.target.value)} />
            <div style={{ maxHeight: 170, overflowY: 'auto', marginTop: 4, border: '1px solid #333', borderRadius: 4 }}>
              {choices.map(n => (
                <div key={n.id} onClick={() => setToId(n.id)}
                  style={{ padding: '5px 8px', cursor: 'pointer', background: n.id === toId ? '#0070f3' : 'transparent', color: n.id === toId ? '#fff' : '#ccc' }}>
                  {n.name}
                </div>
              ))}
              {!choices.length && <div style={{ padding: 8, color: '#777' }}>No nodes match</div>}
            </div>
          </>
        )}

        <span style={label}>Link type</span>
        <select style={field} value={typeId ?? ''} onChange={e => setTypeId(e.target.value ? Number(e.target.value) : null)}>
          {types.map(t => <option key={t.id} value={t.id}>{t.name}{t.arrow ? ' →' : ''}</option>)}
          <option value="">No type (grey)</option>
        </select>
        {type?.description && <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>{type.description}</div>}

        <span style={label}>Label on the line (optional)</span>
        <input style={field} maxLength={80} placeholder="a few words" value={text} onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); }} />

        {error && <div style={{ color: '#f87171', marginTop: 10 }}>{error}</div>}

        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
          {editing && (
            <button style={{ ...btn, background: '#7f1d1d', color: '#fff' }} disabled={busy}
              onClick={() => call('DELETE', `links/${link!.id}`)}>Delete link</button>
          )}
          <div style={{ flex: 1 }} />
          <button style={btn} onClick={onClose}>Cancel</button>
          <button style={{ ...btn, background: '#0070f3', color: '#fff' }} disabled={busy || (!editing && !toId)} onClick={save}>
            {busy ? 'Saving…' : editing ? 'Save' : 'Add link'}
          </button>
        </div>
      </div>
    </div>
  );
}