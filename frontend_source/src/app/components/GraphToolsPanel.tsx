'use client';

// ============================================================
// 🧭 GRAPH TOOLS - questions about how your nodes connect (Neo4j)
// ============================================================
// Right-click a node →
//   🧭 Learning path to here   everything that leads to it along one link
//                              type (e.g. Prerequisite), in the order to
//                              learn them; or what it leads to
//   🧭 Path to another node…   the shortest chain of lines between two nodes
//   🧭 Show nearby             everything within 1–3 steps
// The answer is listed here and lit up on the graph (the rest dims).
// Click a name to select that node. ✕ puts the graph back to normal.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import type { Node, LinkType } from '@/lib/types';

export type GraphToolMode = 'before' | 'after' | 'path' | 'near';

export interface GraphHighlight {
  nodes: number[];
  edges: { from: number; to: number }[];
  badges?: Record<number, string>;     // little label above a node (e.g. learning order)
}

interface Edge { from: number; to: number; kind: 'parent' | 'link'; typeName?: string | null; label?: string }

interface GraphToolsPanelProps {
  apiUrl: string;
  nodes: Node[];
  types: LinkType[];
  mode: GraphToolMode;
  node: Node;
  onClose: () => void;
  onHighlight: (h: GraphHighlight | null) => void;
  onSelectNode: (node: Node) => void;
}

const panel: React.CSSProperties = { position: 'absolute', left: 10, bottom: 10, zIndex: 6, width: 300, maxHeight: '60%', display: 'flex', flexDirection: 'column', background: 'rgba(30,30,46,0.97)', border: '1px solid #444', borderRadius: 6, color: '#ccc', fontSize: 12 };
const small: React.CSSProperties = { background: '#333', color: '#ccc', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 12, cursor: 'pointer' };
const field: React.CSSProperties = { background: '#2a2a3c', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '4px 6px', fontSize: 12 };

const TITLES: Record<GraphToolMode, string> = {
  before: 'Learning path to here',
  after: 'What this leads to',
  path: 'Path to another node',
  near: 'Nearby',
};

export default function GraphToolsPanel({ apiUrl, nodes, types, mode: startMode, node, onClose, onHighlight, onSelectNode }: GraphToolsPanelProps) {
  const [mode, setMode] = useState<GraphToolMode>(startMode);
  // Default link type: one called "Prerequisite…", else the first with an arrow, else the first
  const defaultType = useMemo(
    () => (types.find(t => /prereq/i.test(t.name)) || types.find(t => t.arrow) || types[0])?.id ?? null,
    [types],
  );
  const [typeId, setTypeId] = useState<number | null>(defaultType);
  const [depth, setDepth] = useState(2);
  const [target, setTarget] = useState<Node | null>(null);
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => { setMode(startMode); setTarget(null); setResult(null); }, [startMode, node.id]);
  useEffect(() => { if (typeId === null && defaultType !== null) setTypeId(defaultType); }, [defaultType, typeId]);

  const nameOf = (id: number) => nodes.find(n => n.id === id)?.name || `#${id}`;
  const typeName = types.find(t => t.id === typeId)?.name || 'links';

  // Ask the backend whenever the question changes
  useEffect(() => {
    let url = '';
    if (mode === 'before' || mode === 'after') {
      if (!typeId) { setResult(null); onHighlight(null); return; }
      url = `graph/chain/${node.id}?typeId=${typeId}&direction=${mode}`;
    } else if (mode === 'near') {
      url = `graph/neighbors/${node.id}?depth=${depth}`;
    } else if (target) {
      url = `graph/path?from=${node.id}&to=${target.id}`;
    } else {
      setResult(null); onHighlight(null); return;
    }
    let cancelled = false;
    setLoading(true); setError('');
    fetch(`${apiUrl}/api/mindmap/${url}`)
      .then(async r => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.message || `Failed (${r.status})`);
        return data;
      })
      .then(data => {
        if (cancelled) return;
        setResult(data);
        const ids: number[] = [node.id, ...(data.nodes || []).map((n: any) => n.id)];
        const badges: Record<number, string> = {};
        if (mode === 'before' || mode === 'after') (data.nodes || []).forEach((n: any, i: number) => { badges[n.id] = String(mode === 'before' ? i + 1 : n.depth); });
        if (mode === 'near') (data.nodes || []).forEach((n: any) => { badges[n.id] = String(n.steps); });
        if (mode === 'path') (data.nodes || []).forEach((n: any, i: number) => { badges[n.id] = String(i); });
        onHighlight({ nodes: Array.from(new Set(ids)), edges: (data.edges || []).map((e: Edge) => ({ from: e.from, to: e.to })), badges });
      })
      .catch(e => { if (!cancelled) { setError(e.message); setResult(null); onHighlight(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typeId, depth, target?.id, node.id, apiUrl]);

  const close = () => { onHighlight(null); onClose(); };
  const pick = (id: number) => { const n = nodes.find(x => x.id === id); if (n) onSelectNode(n); };
  const row = (id: number, left: React.ReactNode, right?: React.ReactNode) => (
    <div key={id} onClick={() => pick(id)} style={{ display: 'flex', gap: 6, padding: '3px 4px', cursor: 'pointer', borderRadius: 3 }}
      onMouseEnter={e => (e.currentTarget.style.background = '#2f2f45')} onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <span style={{ color: '#777', minWidth: 18, textAlign: 'right' }}>{left}</span>
      <span style={{ flex: 1, color: '#eee', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(id)}</span>
      {right && <span style={{ color: '#888' }}>{right}</span>}
    </div>
  );
  const describe = (e: Edge) => (e.kind === 'parent' ? 'parent line' : `${e.typeName || 'link'}${e.label ? `: ${e.label}` : ''}`);

  const choices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return nodes.filter(n => n.id !== node.id && (!q || n.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
  }, [nodes, node.id, search]);

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid #333', color: '#fff' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🧭 {TITLES[mode]}: <b>{node.name}</b></span>
        <button style={{ ...small, padding: '1px 7px' }} onClick={close} title="Close and show the whole graph again">✕</button>
      </div>

      <div style={{ padding: '6px 10px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {(mode === 'before' || mode === 'after') && (
          <>
            <select style={field} value={typeId ?? ''} onChange={e => setTypeId(e.target.value ? Number(e.target.value) : null)}>
              {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <button style={{ ...small, background: mode === 'before' ? '#0070f3' : '#333', color: '#fff' }} onClick={() => setMode('before')}>leads here</button>
            <button style={{ ...small, background: mode === 'after' ? '#0070f3' : '#333', color: '#fff' }} onClick={() => setMode('after')}>leads from here</button>
          </>
        )}
        {mode === 'near' && (
          <>
            <span>Steps:</span>
            {[1, 2, 3].map(d => <button key={d} style={{ ...small, background: depth === d ? '#0070f3' : '#333', color: '#fff' }} onClick={() => setDepth(d)}>{d}</button>)}
          </>
        )}
        {mode === 'path' && !target && (
          <input style={{ ...field, width: '100%', boxSizing: 'border-box' }} autoFocus placeholder="To which node? Search…" value={search} onChange={e => setSearch(e.target.value)} />
        )}
        {mode === 'path' && target && (
          <>
            <span>to <b style={{ color: '#fff' }}>{target.name}</b></span>
            <button style={small} onClick={() => { setTarget(null); setResult(null); onHighlight(null); }}>change</button>
          </>
        )}
      </div>

      <div style={{ overflowY: 'auto', padding: '0 6px 8px' }}>
        {mode === 'path' && !target && choices.map(n => (
          <div key={n.id} onClick={() => setTarget(n)} style={{ padding: '3px 4px', cursor: 'pointer', color: '#ccc' }}>{n.name}</div>
        ))}
        {loading && <div style={{ color: '#888', padding: 4 }}>Asking Neo4j…</div>}
        {error && <div style={{ color: '#f87171', padding: 4 }}>{error}</div>}

        {!loading && !error && result && (mode === 'before' || mode === 'after') && (
          result.nodes.length
            ? <>
                <div style={{ color: '#888', padding: '0 4px 4px' }}>
                  {mode === 'before' ? `Learn in this order (${typeName}), then ${node.name}:` : `Along ${typeName} lines (number = steps away):`}
                </div>
                {result.nodes.map((n: any, i: number) => row(n.id, mode === 'before' ? `${i + 1}.` : n.depth))}
              </>
            : <div style={{ color: '#888', padding: 4 }}>
                {mode === 'before' ? `Nothing leads to ${node.name} along ${typeName} lines yet.` : `${node.name} doesn't lead anywhere along ${typeName} lines yet.`}
              </div>
        )}

        {!loading && !error && result && mode === 'near' && (
          result.nodes.length
            ? result.nodes.map((n: any) => row(n.id, n.steps, n.steps === 1 ? 'step' : 'steps'))
            : <div style={{ color: '#888', padding: 4 }}>Nothing is connected to {node.name} yet.</div>
        )}

        {!loading && !error && result && mode === 'path' && target && (
          result.found
            ? result.nodes.map((n: any, i: number) => (
                <React.Fragment key={n.id}>
                  {row(n.id, i)}
                  {i < result.edges.length && <div style={{ color: '#777', paddingLeft: 30, fontSize: 11 }}>↓ {describe(result.edges[i])}</div>}
                </React.Fragment>
              ))
            : <div style={{ color: '#888', padding: 4 }}>{node.name} and {target.name} aren't connected (within 12 steps).</div>
        )}
      </div>
    </div>
  );
}