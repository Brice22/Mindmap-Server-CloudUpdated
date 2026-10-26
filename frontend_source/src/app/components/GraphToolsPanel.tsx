'use client';

// ============================================================
// 🧭 GRAPH TOOLS - questions about how your nodes connect (Neo4j)
// ============================================================
// Right-click a node →
//   🧭 Learning path to here   everything that leads to it along one link
//                              type (e.g. Prerequisite), in the order to
//                              learn them; or what it leads to
//   🎯 Goal path from here     the goals that follow this one along one link
//                              type (e.g. "Next goal"): ✓ done, ▶ next up,
//                              "✓ Done" marks it finished and moves you on
//   🧭 Path to another node…   the shortest chain of lines between two nodes
//   🧭 Show nearby             everything within 1–3 steps (parent lines,
//                              your links, and docs that mention each other)
// The answer is listed here, lit up on the graph (the rest dims) and zoomed
// into view (📍 zooms back to it). Click a name to select that node.
// ✕ puts the graph back to normal.
// Done = the node's To-Do status is "done" (right-click → ✅ Mark Done).
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import type { Node, LinkType } from '@/lib/types';

export type GraphToolMode = 'before' | 'after' | 'goals' | 'path' | 'near';

export interface GraphHighlight {
  nodes: number[];
  edges: { from: number; to: number }[];
  badges?: Record<number, string>;     // little label above a node (order, steps away, ✓)
  fitKey?: string;                     // a new value zooms the graph to fit these nodes
}

interface Edge { from: number; to: number; kind: 'parent' | 'link' | 'mention'; typeName?: string | null; label?: string }

interface GraphToolsPanelProps {
  apiUrl: string;
  nodes: Node[];
  types: LinkType[];
  mode: GraphToolMode;
  node: Node;
  onClose: () => void;
  onHighlight: (h: GraphHighlight | null) => void;
  onSelectNode: (node: Node) => void;
  onMarkDone?: (node: Node) => void;   // 🎯 "✓ Done" on the next goal
}

const panel: React.CSSProperties = { position: 'absolute', left: 10, bottom: 10, zIndex: 6, width: 310, maxHeight: '60%', display: 'flex', flexDirection: 'column', background: 'rgba(30,30,46,0.97)', border: '1px solid #444', borderRadius: 6, color: '#ccc', fontSize: 12 };
const small: React.CSSProperties = { background: '#333', color: '#ccc', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 12, cursor: 'pointer' };
const field: React.CSSProperties = { background: '#2a2a3c', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '4px 6px', fontSize: 12 };

const TITLES: Record<GraphToolMode, string> = {
  before: 'Learning path to here',
  after: 'What this leads to',
  goals: 'Goal path from here',
  path: 'Path to another node',
  near: 'Nearby',
};

const metaOf = (n?: Node) => (typeof n?.metadata === 'string' ? JSON.parse(n.metadata as any) : (n?.metadata as any) || {});

export default function GraphToolsPanel({ apiUrl, nodes, types, mode: startMode, node, onClose, onHighlight, onSelectNode, onMarkDone }: GraphToolsPanelProps) {
  const [mode, setMode] = useState<GraphToolMode>(startMode);
  // Default link type for each question
  const defaultType = (m: GraphToolMode) => (
    m === 'goals'
      ? types.find(t => /goal|next/i.test(t.name)) || types.find(t => t.arrow) || types[0]
      : types.find(t => /prereq/i.test(t.name)) || types.find(t => t.arrow) || types[0]
  )?.id ?? null;
  const [typeId, setTypeId] = useState<number | null>(() => defaultType(startMode));
  const [depth, setDepth] = useState(2);
  const [target, setTarget] = useState<Node | null>(null);
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [fitNonce, setFitNonce] = useState(0);

  useEffect(() => { setMode(startMode); setTarget(null); setResult(null); setTypeId(defaultType(startMode)); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [startMode, node.id]);
  useEffect(() => { if (typeId === null && types.length) setTypeId(defaultType(mode)); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [types, typeId]);

  const byId = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const nameOf = (id: number) => byId.get(id)?.name || `#${id}`;
  const isDone = (id: number) => metaOf(byId.get(id)).todoStatus === 'done';
  const typeName = types.find(t => t.id === typeId)?.name || 'links';
  const chainMode = mode === 'before' || mode === 'after' || mode === 'goals';

  // 1. Ask the backend whenever the question changes
  useEffect(() => {
    let url = '';
    if (chainMode) {
      if (!typeId) { setResult(null); return; }
      url = `graph/chain/${node.id}?typeId=${typeId}&direction=${mode === 'before' ? 'before' : 'after'}`;
    } else if (mode === 'near') {
      url = `graph/neighbors/${node.id}?depth=${depth}`;
    } else if (target) {
      url = `graph/path?from=${node.id}&to=${target.id}`;
    } else {
      setResult(null); return;
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
        // Forward questions: nearest first (the next goal / next step on top)
        if (mode === 'after' || mode === 'goals') data.nodes = [...data.nodes].sort((a: any, b: any) => a.depth - b.depth || a.name.localeCompare(b.name));
        // Goals: the goal you started from is the first one on the path
        if (mode === 'goals') data.nodes = [{ id: node.id, name: node.name, depth: 0 }, ...data.nodes];
        setResult({ ...data, mode });
        setFitNonce(n => n + 1);
      })
      .catch(e => { if (!cancelled) { setError(e.message); setResult(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, typeId, depth, target?.id, node.id, apiUrl]);

  // The first goal that isn't done yet
  const nextGoal = mode === 'goals' && result?.mode === 'goals' ? result.nodes.find((n: any) => !isDone(n.id)) : null;
  const doneKey = (result?.nodes || []).map((n: any) => (isDone(n.id) ? 1 : 0)).join('');

  // 2. Light it up on the graph (again when a goal is marked done, without asking Neo4j again)
  useEffect(() => {
    if (!result || result.mode !== mode) { onHighlight(null); return; }
    const list: any[] = result.nodes || [];
    const badges: Record<number, string> = {};
    if (mode === 'before') list.forEach((n, i) => { badges[n.id] = isDone(n.id) ? '✓' : String(i + 1); });
    if (mode === 'after') list.forEach(n => { badges[n.id] = isDone(n.id) ? '✓' : String(n.depth); });
    if (mode === 'goals') list.forEach((n, i) => { badges[n.id] = isDone(n.id) ? '✓' : n.id === nextGoal?.id ? '▶' : String(i + 1); });
    if (mode === 'near') list.forEach(n => { badges[n.id] = String(n.steps); });
    if (mode === 'path') list.forEach((n, i) => { badges[n.id] = String(i); });
    onHighlight({
      nodes: Array.from(new Set([node.id, ...list.map(n => n.id)])),
      edges: (result.edges || []).map((e: Edge) => ({ from: e.from, to: e.to })),
      badges,
      fitKey: `${mode}:${node.id}:${fitNonce}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, doneKey, fitNonce]);

  const close = () => { onHighlight(null); onClose(); };
  const pick = (id: number) => { const n = byId.get(id); if (n) onSelectNode(n); };
  const row = (id: number, left: React.ReactNode, right?: React.ReactNode, strong = false) => (
    <div key={id} onClick={() => pick(id)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', cursor: 'pointer', borderRadius: 3, background: strong ? '#2b3a55' : 'transparent' }}
      onMouseEnter={e => { if (!strong) e.currentTarget.style.background = '#2f2f45'; }} onMouseLeave={e => { if (!strong) e.currentTarget.style.background = 'transparent'; }}>
      <span style={{ color: '#777', minWidth: 18, textAlign: 'right' }}>{left}</span>
      <span style={{ flex: 1, color: isDone(id) ? '#7c8' : '#eee', textDecoration: isDone(id) && mode !== 'near' && mode !== 'path' ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nameOf(id)}</span>
      {right && <span style={{ color: '#888' }}>{right}</span>}
    </div>
  );
  const describe = (e: Edge) => (e.kind === 'parent' ? 'parent line' : e.kind === 'mention' ? 'mentioned in a doc' : `${e.typeName || 'link'}${e.label ? `: ${e.label}` : ''}`);

  const choices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return nodes.filter(n => n.id !== node.id && (!q || n.name.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
  }, [nodes, node.id, search]);

  const doneCount = mode === 'goals' && result?.mode === 'goals' ? result.nodes.filter((n: any) => isDone(n.id)).length : 0;

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid #333', color: '#fff' }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mode === 'goals' ? '🎯' : '🧭'} {TITLES[mode]}: <b>{node.name}</b></span>
        {result && <button style={{ ...small, padding: '1px 7px' }} onClick={() => setFitNonce(n => n + 1)} title="Zoom the graph to these nodes again">📍</button>}
        <button style={{ ...small, padding: '1px 7px' }} onClick={close} title="Close and show the whole graph again">✕</button>
      </div>

      <div style={{ padding: '6px 10px', display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {chainMode && (
          <select style={field} value={typeId ?? ''} onChange={e => setTypeId(e.target.value ? Number(e.target.value) : null)}>
            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        )}
        {(mode === 'before' || mode === 'after') && (
          <>
            <button style={{ ...small, background: mode === 'before' ? '#0070f3' : '#333', color: '#fff' }} onClick={() => setMode('before')}>leads here</button>
            <button style={{ ...small, background: mode === 'after' ? '#0070f3' : '#333', color: '#fff' }} onClick={() => setMode('after')}>leads from here</button>
          </>
        )}
        {mode === 'goals' && !types.some(t => /goal|next/i.test(t.name)) && (
          <div style={{ color: '#888', fontSize: 11, width: '100%' }}>
            Tip: add a link type called <b>Next goal</b> (🔗 Lines → ✎ Edit types, with an arrow), then link each goal → the goal after it.
          </div>
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
            <button style={small} onClick={() => { setTarget(null); setResult(null); }}>change</button>
          </>
        )}
      </div>

      <div style={{ overflowY: 'auto', padding: '0 6px 8px' }}>
        {mode === 'path' && !target && choices.map(n => (
          <div key={n.id} onClick={() => setTarget(n)} style={{ padding: '3px 4px', cursor: 'pointer', color: '#ccc' }}>{n.name}</div>
        ))}
        {loading && <div style={{ color: '#888', padding: 4 }}>Asking Neo4j…</div>}
        {error && <div style={{ color: '#f87171', padding: 4 }}>{error}</div>}

        {!loading && !error && result?.mode === mode && (mode === 'before' || mode === 'after') && (
          result.nodes.length
            ? <>
                <div style={{ color: '#888', padding: '0 4px 4px' }}>
                  {mode === 'before' ? `Learn in this order (${typeName}), then ${node.name}:` : `Along ${typeName} lines (number = steps away):`}
                </div>
                {result.nodes.map((n: any, i: number) => row(n.id, isDone(n.id) ? '✓' : mode === 'before' ? `${i + 1}.` : n.depth))}
              </>
            : <div style={{ color: '#888', padding: 4 }}>
                {mode === 'before' ? `Nothing leads to ${node.name} along ${typeName} lines yet.` : `${node.name} doesn't lead anywhere along ${typeName} lines yet.`}
              </div>
        )}

        {!loading && !error && result?.mode === 'goals' && mode === 'goals' && (
          result.nodes.length
            ? <>
                <div style={{ color: '#888', padding: '0 4px 4px' }}>
                  {doneCount} of {result.nodes.length} done{nextGoal ? '' : ' — every goal on this path is finished 🎉'}
                  {result.nodes.length === 1 && ` · No goals follow ${node.name} along ${typeName} lines yet.`}
                </div>
                {result.nodes.map((n: any, i: number) => {
                  const isNext = n.id === nextGoal?.id;
                  return row(n.id, isDone(n.id) ? '✓' : isNext ? '▶' : `${i + 1}.`,
                    isNext && onMarkDone
                      ? <button style={{ ...small, background: '#15803d', color: '#fff', padding: '1px 8px' }}
                          onClick={e => { e.stopPropagation(); const g = byId.get(n.id); if (g) onMarkDone(g); }}>✓ Done</button>
                      : undefined,
                    isNext);
                })}
              </>
            : null
        )}

        {!loading && !error && result?.mode === 'near' && mode === 'near' && (
          result.nodes.length
            ? result.nodes.map((n: any) => row(n.id, n.steps, n.steps === 1 ? 'step' : 'steps'))
            : <div style={{ color: '#888', padding: 4 }}>Nothing is connected to {node.name} yet.</div>
        )}

        {!loading && !error && result?.mode === 'path' && mode === 'path' && target && (
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