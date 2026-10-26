'use client';

// ============================================================
// 🔗 LINES LEGEND - top-right of the graph
// ============================================================
// - Shows what each line colour means, with how many lines use it
// - Click a row to hide/show that kind of line (remembered per browser)
// - "Auto" = the dashed backlink lines made from your documents
//   (blue = linked, grey = mentioned)
// - ✎ Edit types (owner): add, rename, recolour, dashed/solid, arrow,
//   delete (its lines stay, as "No type")
// ============================================================

import React, { useState } from 'react';
import type { LinkType, NodeLink } from '@/lib/types';

interface LinkLegendProps {
  apiUrl: string;
  types: LinkType[];
  links: NodeLink[];
  hidden: Set<string>;                 // type ids (as text) or 'none' that are hidden
  onToggle: (key: string) => void;
  autoOn: boolean;                     // backlink lines from documents
  onToggleAuto: () => void;
  canEdit: boolean;
  onChanged: () => void;               // reload links + types
}

const panel: React.CSSProperties = { position: 'absolute', top: 10, right: 10, zIndex: 5, background: 'rgba(30,30,46,0.95)', border: '1px solid #444', borderRadius: 6, color: '#ccc', fontSize: 12, minWidth: 170, maxWidth: 320 };
const small: React.CSSProperties = { background: '#333', color: '#ccc', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 12, cursor: 'pointer' };
const input: React.CSSProperties = { background: '#2a2a3c', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '3px 6px', fontSize: 12 };

// A little picture of the line: colour, dashed or solid, arrow
export function LineSwatch({ color, dashed, arrow }: { color: string; dashed: boolean; arrow: boolean }) {
  return (
    <svg width="30" height="10" style={{ flexShrink: 0 }}>
      <line x1="1" y1="5" x2={arrow ? 22 : 29} y2="5" stroke={color} strokeWidth="2.5" strokeDasharray={dashed ? '5,3' : undefined} />
      {arrow && <path d="M21,1 L29,5 L21,9 Z" fill={color} />}
    </svg>
  );
}

function TypeEditor({ apiUrl, type, onDone }: { apiUrl: string; type?: LinkType; onDone: (changed: boolean) => void }) {
  const [name, setName] = useState(type?.name || '');
  const [color, setColor] = useState(type?.color || '#0ea5e9');
  const [dashed, setDashed] = useState(type?.dashed ?? true);
  const [arrow, setArrow] = useState(type?.arrow ?? false);
  const [description, setDescription] = useState(type?.description || '');
  const [error, setError] = useState('');

  const send = async (method: string, path: string, body?: any) => {
    setError('');
    const r = await fetch(`${apiUrl}/api/mindmap/${path}`, {
      method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { setError(data.message || `Failed (${r.status})`); return; }
    onDone(true);
  };
  const save = () => send(type ? 'PUT' : 'POST', type ? `link-types/${type.id}` : 'link-types', { name, color, dashed, arrow, description });

  return (
    <div style={{ background: '#252536', borderRadius: 4, padding: 8, margin: '4px 0' }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="color" value={color} onChange={e => setColor(e.target.value)} style={{ width: 28, height: 24, padding: 0, border: 'none', background: 'none' }} />
        <input style={{ ...input, flex: 1 }} autoFocus maxLength={40} placeholder="Name, e.g. Prerequisite" value={name}
          onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') save(); }} />
      </div>
      <input style={{ ...input, width: '100%', boxSizing: 'border-box', marginTop: 6 }} maxLength={200} placeholder="What it means (optional)"
        value={description} onChange={e => setDescription(e.target.value)} />
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
        <label><input type="checkbox" checked={dashed} onChange={e => setDashed(e.target.checked)} /> dashed</label>
        <label><input type="checkbox" checked={arrow} onChange={e => setArrow(e.target.checked)} /> arrow</label>
        <LineSwatch color={color} dashed={dashed} arrow={arrow} />
      </div>
      {error && <div style={{ color: '#f87171', marginTop: 4 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
        {type && (
          <button style={{ ...small, background: '#7f1d1d', color: '#fff' }}
            onClick={() => { if (window.confirm(`Delete the link type "${type.name}"? Its lines stay, as grey "No type" lines.`)) send('DELETE', `link-types/${type.id}`); }}>
            Delete
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button style={small} onClick={() => onDone(false)}>Cancel</button>
        <button style={{ ...small, background: '#0070f3', color: '#fff' }} onClick={save}>{type ? 'Save' : 'Add'}</button>
      </div>
    </div>
  );
}

export default function LinkLegend({ apiUrl, types, links, hidden, onToggle, autoOn, onToggleAuto, canEdit, onChanged }: LinkLegendProps) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('hserver:legendOpen') !== '0'; } catch { return true; }
  });
  const [editMode, setEditMode] = useState(false);
  const [editing, setEditing] = useState<number | 'new' | null>(null);

  const toggleOpen = () => {
    setOpen(o => { try { localStorage.setItem('hserver:legendOpen', o ? '0' : '1'); } catch {} return !o; });
  };
  const count = (typeId: number | null) => links.filter(l => l.typeId === typeId).length;
  const untyped = count(null);

  const row = (key: string, swatch: React.ReactNode, name: string, n: number | null, title?: string, onEdit?: () => void) => {
    const off = key === 'auto' ? !autoOn : hidden.has(key);
    return (
      <div key={key} title={title} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 0', opacity: off ? 0.4 : 1 }}>
        <div onClick={() => (key === 'auto' ? onToggleAuto() : onToggle(key))} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, cursor: 'pointer', minWidth: 0 }}>
          <span style={{ width: 12 }}>{off ? '○' : '●'}</span>
          {swatch}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          {n !== null && <span style={{ color: '#777' }}>{n}</span>}
        </div>
        {editMode && onEdit && <button style={{ ...small, padding: '1px 6px' }} onClick={onEdit}>✎</button>}
      </div>
    );
  };

  return (
    <div style={panel}>
      <div onClick={toggleOpen} style={{ padding: '5px 10px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', color: '#fff' }}>
        <span>🔗 Lines</span><span>{open ? '▾' : '▸'}</span>
      </div>
      {open && (
        <div style={{ padding: '0 10px 8px' }}>
          {types.map(t => editing === t.id
            ? <TypeEditor key={t.id} apiUrl={apiUrl} type={t} onDone={c => { setEditing(null); if (c) onChanged(); }} />
            : row(String(t.id), <LineSwatch color={t.color} dashed={t.dashed} arrow={t.arrow} />, t.name, count(t.id), t.description, () => setEditing(t.id)))}
          {(untyped > 0 || editMode) && row('none', <LineSwatch color="#9ca3af" dashed={false} arrow={false} />, 'No type', untyped)}
          {row('auto', <LineSwatch color="#3b82f6" dashed arrow={false} />, 'Auto (from docs)', null, 'Dashed lines made from your documents: blue = linked, grey = mentioned')}
          {editing === 'new' && <TypeEditor apiUrl={apiUrl} onDone={c => { setEditing(null); if (c) onChanged(); }} />}
          {canEdit && (
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button style={small} onClick={() => { setEditMode(m => !m); setEditing(null); }}>{editMode ? 'Done' : '✎ Edit types'}</button>
              {editMode && editing !== 'new' && <button style={small} onClick={() => setEditing('new')}>+ New type</button>}
            </div>
          )}
          {!links.length && !editMode && <div style={{ color: '#777', marginTop: 6, fontSize: 11 }}>Right-click a node → 🔗 Link to another node</div>}
        </div>
      )}
    </div>
  );
}