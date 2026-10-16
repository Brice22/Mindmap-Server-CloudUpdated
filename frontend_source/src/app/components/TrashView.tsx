'use client';

// ============================================================
// TRASH VIEW - deleted nodes and documents (kept 30 days)
// ============================================================
// Restore puts a node back with its documents and links, or a
// document back in its node (Unfiled if that node is gone).
// Delete forever / Empty trash cannot be undone.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface TrashItem {
  id: number;
  item_type: 'node' | 'document';
  item_id: number;
  title: string | null;
  deleted_at: string;
  days_left: number;
  home_node_name: string | null;
  doc_count: number | null;
}

interface TrashViewProps {
  onRestored?: () => void;   // e.g. reload the graph after a node comes back
}

const btn: React.CSSProperties = { border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 12, cursor: 'pointer' };

export default function TrashView({ onRestored }: TrashViewProps) {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [message, setMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/mindmap/trash`);
      setItems(res.ok ? await res.json() : []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const restore = async (item: TrashItem) => {
    setBusyId(item.id);
    try {
      const res = await fetch(`${API_URL}/api/mindmap/trash/${item.id}/restore`, { method: 'POST' });
      setMessage(res.ok ? `Restored “${item.title}”` : `Could not restore “${item.title}”`);
      if (res.ok) onRestored?.();
    } catch {
      setMessage(`Could not restore “${item.title}”`);
    }
    setBusyId(null);
    load();
  };

  const remove = async (item: TrashItem) => {
    if (!confirm(`Delete “${item.title}” forever? This cannot be undone.`)) return;
    setBusyId(item.id);
    try { await fetch(`${API_URL}/api/mindmap/trash/${item.id}`, { method: 'DELETE' }); } catch {}
    setBusyId(null);
    load();
  };

  const emptyAll = async () => {
    if (!confirm(`Delete all ${items.length} item(s) in the Trash forever? This cannot be undone.`)) return;
    try { await fetch(`${API_URL}/api/mindmap/trash`, { method: 'DELETE' }); } catch {}
    load();
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 24, color: '#ccc' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 800 }}>
        <div>
          <h2 style={{ margin: 0, color: '#fff' }}>🗑️ Trash</h2>
          <div style={{ fontSize: 12, color: '#777', marginTop: 4 }}>Deleted nodes and documents are kept for 30 days, then removed automatically.</div>
        </div>
        {items.length > 0 && <button onClick={emptyAll} style={{ ...btn, background: '#7f1d1d', color: '#fff' }}>Empty trash</button>}
      </div>

      {message && <div style={{ marginTop: 12, fontSize: 13, color: '#22c55e' }}>{message}</div>}

      <div style={{ marginTop: 16, maxWidth: 800 }}>
        {loading && <div style={{ color: '#666' }}>Loading…</div>}
        {!loading && items.length === 0 && <div style={{ color: '#666' }}>The Trash is empty.</div>}
        {items.map(item => (
          <div key={item.id} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', marginBottom: 6,
            background: '#1e1e2e', border: '1px solid #333', borderRadius: 6,
          }}>
            <span style={{ fontSize: 20 }}>{item.item_type === 'node' ? '⚪' : '📄'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title || 'Untitled'}</div>
              <div style={{ fontSize: 11, color: '#777' }}>
                {item.item_type === 'node'
                  ? `Node${item.doc_count ? ` · ${item.doc_count} document(s) come back with it` : ''}`
                  : `Document${item.home_node_name ? ` · from ${item.home_node_name}` : ' · Unfiled'}`}
                {' · deleted '}{new Date(item.deleted_at).toLocaleDateString()}
                {' · '}<span style={{ color: item.days_left <= 3 ? '#f59e0b' : '#777' }}>{item.days_left} day(s) left</span>
              </div>
            </div>
            <button disabled={busyId === item.id} onClick={() => restore(item)} style={{ ...btn, background: '#0070f3', color: '#fff' }}>
              {busyId === item.id ? '…' : 'Restore'}
            </button>
            <button disabled={busyId === item.id} onClick={() => remove(item)} style={{ ...btn, background: '#333', color: '#ccc' }}>
              Delete forever
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}