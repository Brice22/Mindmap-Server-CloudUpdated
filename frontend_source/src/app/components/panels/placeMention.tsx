'use client';

// ============================================================
// 📍 PLACES IN DOCS ( /place )
// ============================================================
// Type /place → a search box opens right in the text → type a city,
// address or venue and press Enter → pick a result → a 📍 chip is
// inserted with the place's name and coordinates.
// When the doc is saved:
//   - the place shows on Maps (the "📍 Places in docs" overlay)
//   - if it lies inside a node's map area (e.g. Chicago), that node
//     gets a backlink to this doc
// Click a chip to search again / change it.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { createReactInlineContentSpec } from '@blocknote/react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface GeoResult { label: string; name: string; type: string; lat: number; lng: number }

function PlaceView({ name, lat, lng, onPick, editor }: {
  name: string; lat: number; lng: number; editor: any;
  onPick: (r: { name: string; lat: number; lng: number }) => void;
}) {
  const [editing, setEditing] = useState(!name);
  const [query, setQuery] = useState(name);
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const search = async () => {
    if (query.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/api/mindmap/geocode?q=${encodeURIComponent(query.trim())}`);
      setResults(res.ok ? await res.json() : []);
    } catch {
      setResults([]);
    }
    setBusy(false);
  };

  const pick = (r: GeoResult) => {
    onPick({ name: r.name || r.label.split(',')[0], lat: r.lat, lng: r.lng });
    setEditing(false);
    setResults(null);
    editor.focus();
  };

  return (
    <span style={{ position: 'relative' }}>
      <span
        onMouseDown={e => { e.preventDefault(); setEditing(true); }}
        title={name ? `${lat.toFixed(4)}, ${lng.toFixed(4)} — click to change` : 'Search for a place'}
        style={{ color: '#f87171', background: '#7f1d1d55', borderRadius: 4, padding: '0 4px', cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        📍 {name || 'place…'}
      </span>
      {editing && (
        <span style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 60, marginTop: 4, width: 300,
          background: '#1e1e2e', border: '1px solid #ef4444', borderRadius: 6, padding: 6, display: 'block',
        }}>
          <span style={{ display: 'flex', gap: 4 }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); search(); }
                if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setResults(null); editor.focus(); }
              }}
              placeholder="City, address or venue — Enter to search"
              style={{ flex: 1, minWidth: 0, background: '#0f0f14', color: '#e5e5e5', border: '1px solid #444', borderRadius: 4, padding: '3px 6px', fontSize: 12 }}
            />
            <button onMouseDown={e => e.preventDefault()} onClick={search}
              style={{ fontSize: 11, border: 'none', borderRadius: 4, background: '#333', color: '#ddd', cursor: 'pointer' }}>
              {busy ? '…' : 'Search'}
            </button>
          </span>
          {results && results.length === 0 && (
            <span style={{ display: 'block', color: '#888', fontSize: 11, marginTop: 4 }}>No results (or search unavailable).</span>
          )}
          {results && results.map((r, i) => (
            <span key={i} onMouseDown={e => { e.preventDefault(); pick(r); }}
              style={{ display: 'block', padding: '4px 2px', borderBottom: '1px solid #333', cursor: 'pointer', fontSize: 12 }}>
              <span style={{ color: '#f87171' }}>{r.name}</span> <span style={{ color: '#777' }}>· {r.type}</span>
              <span style={{ display: 'block', color: '#777', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

export const PlaceMention = createReactInlineContentSpec(
  {
    type: 'place',
    propSchema: {
      name: { default: '' },
      lat: { default: 0 },
      lng: { default: 0 },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent, updateInlineContent, editor }) => (
      <PlaceView
        editor={editor}
        name={inlineContent.props.name}
        lat={inlineContent.props.lat}
        lng={inlineContent.props.lng}
        onPick={p => updateInlineContent({ type: 'place', props: p })}
      />
    ),
  },
);