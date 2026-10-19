'use client';

// ============================================================
// BACKLINKS PANEL (Inspector) — everything that points at a node
// ============================================================
// - Linked: @mentions in Docs, [[Node]] anywhere, map pins
// - Mentioned in: the node's name (or an alias) appears in a doc,
//   a Draw note or another node's description — found automatically
// - Also known as: extra names (abbreviations, old names) that count
//   as mentions, e.g. "UIUC" for "University of Illinois"
// - Child nodes: nodes whose parent is this node
// Click an entry to select the node it came from.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import type { Node } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface Backlink {
  kind: 'link' | 'mention';
  source_type: 'doc' | 'drawing' | 'description' | 'map' | 'file';
  source_id: number;
  source_node_id: number | null;
  source_node_name: string | null;
  doc_title: string | null;
  file_name?: string | null;     // source_type 'file': text read from a PDF, Word file, …
  file_path?: string | null;
  file_mime?: string | null;
  snippet: string | null;
}

interface BacklinksPanelProps {
  node: Node;
  nodes: Node[];
  refreshKey: number;                                           // bump to re-fetch (e.g. after closing the workspace)
  onSelectNode: (node: Node) => void;
  onUpdateNode: (nodeId: number, updates: Partial<Node>) => void;
  onOpenFile?: (file: { id: number; name: string; path: string; mime: string | null }) => void;   // preview a file that mentions this node
}

const ICONS: Record<Backlink['source_type'], string> = { doc: '📄', drawing: '✏️', description: '📝', map: '📍', file: '📎' };

function metaOf(n: Node): any {
  return typeof n.metadata === 'string' ? JSON.parse(n.metadata || '{}') : n.metadata || {};
}

export default function BacklinksPanel({ node, nodes, refreshKey, onSelectNode, onUpdateNode, onOpenFile }: BacklinksPanelProps) {
  const [links, setLinks] = useState<Backlink[]>([]);
  const [loading, setLoading] = useState(false);
  const aliases: string[] = Array.isArray(metaOf(node).aliases) ? metaOf(node).aliases : [];
  const [aliasText, setAliasText] = useState(aliases.join(', '));

  useEffect(() => { setAliasText(aliases.join(', ')); }, [node.id, aliases.join('|')]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/mindmap/node/${node.id}/backlinks`);
      setLinks(res.ok ? await res.json() : []);
    } catch {
      setLinks([]);
    }
    setLoading(false);
  }, [node.id]);

  // Small delay so links from a save that just happened are ready
  useEffect(() => {
    const t = setTimeout(load, 400);
    return () => clearTimeout(t);
  }, [load, refreshKey]);

  const saveAliases = () => {
    const next = aliasText.split(',').map(s => s.trim()).filter(Boolean);
    if (next.join('|') === aliases.join('|')) return;
    onUpdateNode(node.id, { metadata: { aliases: next } } as any);
    setTimeout(load, 1200);
  };

  const children = nodes.filter(n => (metaOf(n).parent || '').toLowerCase() === node.name.toLowerCase());
  const explicit = links.filter(l => l.kind === 'link');
  const mentions = links.filter(l => l.kind === 'mention');

  const label = (l: Backlink) => {
    const where = l.source_node_name || 'Unfiled';
    if (l.source_type === 'doc') return `${l.doc_title || 'Document'} · ${where}`;
    if (l.source_type === 'drawing') return `Draw notes · ${where}`;
    if (l.source_type === 'map') return `Map pin · ${where}`;
    if (l.source_type === 'file') return `${l.file_name || 'File'} · ${l.source_node_name || 'no node'}`;
    return `Description · ${where}`;
  };

  const renderLink = (l: Backlink, i: number) => {
    const source = nodes.find(n => n.id === l.source_node_id);
    return (
      <div key={`${l.source_type}-${l.source_id}-${i}`}
        onClick={() => {
          if (l.source_type === 'file' && l.file_path && onOpenFile) onOpenFile({ id: l.source_id, name: l.file_name || 'File', path: l.file_path, mime: l.file_mime ?? null });
          else if (source) onSelectNode(source);
        }}
        title={l.source_type === 'file' ? 'Open the file' : source ? `Select ${source.name}` : 'Its node was deleted'}
        style={{ padding: '6px 4px', borderBottom: '1px solid #2a2a2a', cursor: source || l.source_type === 'file' ? 'pointer' : 'default' }}>
        <div style={{ color: '#60a5fa', fontSize: 13 }}>{ICONS[l.source_type]} {label(l)}</div>
        {l.snippet && <div style={{ color: '#888', fontSize: 11, marginTop: 2, lineHeight: 1.35 }}>{l.snippet}</div>}
      </div>
    );
  };

  const heading: React.CSSProperties = { margin: '10px 0 4px', color: '#888', fontSize: 11, textTransform: 'uppercase' };

  return (
    <div style={{ marginBottom: 20, background: '#111', padding: 10, borderRadius: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, color: '#aaa' }}>Backlinks</h4>
        <button onClick={load} title="Refresh" style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>
          {loading ? '…' : '↻'}
        </button>
      </div>

      <div style={heading}>Also known as</div>
      <input value={aliasText} onChange={e => setAliasText(e.target.value)}
        onBlur={saveAliases} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        placeholder="Other names, comma separated (e.g. UIUC)"
        style={{ width: '100%', boxSizing: 'border-box', background: '#1e1e2e', color: '#ddd', border: '1px solid #333', borderRadius: 4, padding: '4px 6px', fontSize: 12 }} />

      {explicit.length > 0 && (<><div style={heading}>Linked ({explicit.length})</div>{explicit.map(renderLink)}</>)}
      {mentions.length > 0 && (<><div style={heading}>Mentioned in ({mentions.length})</div>{mentions.map(renderLink)}</>)}
      {children.length > 0 && (
        <>
          <div style={heading}>Child nodes ({children.length})</div>
          {children.map(c => (
            <div key={c.id} onClick={() => onSelectNode(c)}
              style={{ padding: '5px 4px', borderBottom: '1px solid #2a2a2a', cursor: 'pointer', color: '#0070f3', fontSize: 13 }}>
              ↳ {c.name}
            </div>
          ))}
        </>
      )}
      {links.length === 0 && children.length === 0 && !loading && (
        <div style={{ fontStyle: 'italic', color: '#666', marginTop: 8, fontSize: 12 }}>
          Nothing links here yet. Mention “{node.name}” in a doc, a Draw note or a description, or type @ in Docs.
        </div>
      )}
    </div>
  );
}