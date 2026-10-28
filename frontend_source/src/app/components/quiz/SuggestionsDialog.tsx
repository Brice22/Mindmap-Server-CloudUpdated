'use client';

// ============================================================
// ✨ SUGGESTED QUESTIONS - made from your map, waiting for you
// ============================================================
// Questions the map can ask for this deck (or everything): from node
// descriptions, sub-nodes, Prerequisite / Causes / Example-of links, other
// links with a label, and lesson plans. Nothing joins your decks until you
// keep it.
//   ✓ Keep        → normal cards (daily review, LLE chart, spaced repetition)
//   ✕ Dismiss     → hidden; "Show dismissed" brings them back
// Kept cards follow the map: rename a node or change a link and the card
// changes with it (your review history stays).
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import MathText from '@/lib/MathText';
import { KIND_INFO, cellLabel } from '@/lib/lle';

export interface Suggestion {
  key: string; source: string; nodeId: number; nodeName: string;
  kind: 'recall' | 'explain' | 'choice'; question: string; answer: string;
  spec: any; lleLevel: number; lleRep: string;
}

interface Props {
  apiUrl: string;
  deckTitle: string;
  nodeIds: number[] | null;      // null = everything
  onClose: () => void;
  onChanged: () => void;         // reload cards
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 };
const box: React.CSSProperties = { background: '#2a2a3a', padding: 20, borderRadius: 8, width: 820, maxWidth: '96vw', height: '86vh', display: 'flex', flexDirection: 'column', border: '1px solid #444', color: '#ccc', fontSize: 13 };
const btn: React.CSSProperties = { border: 'none', padding: '7px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 13 };

export default function SuggestionsDialog({ apiUrl, deckTitle, nodeIds, onClose, onChanged }: Props) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [dismissed, setDismissed] = useState<Suggestion[]>([]);
  const [dismissedCount, setDismissedCount] = useState(0);
  const [showDismissed, setShowDismissed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [source, setSource] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [open, setOpen] = useState<string | null>(null);   // answer shown for this one

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (nodeIds) q.set('nodeIds', nodeIds.join(','));
      if (showDismissed) q.set('dismissed', '1');
      const r = await fetch(`${apiUrl}/api/mindmap/quiz/suggestions?${q}`);
      const d = r.ok ? await r.json() : { suggestions: [], dismissed: [], dismissedCount: 0 };
      setItems(d.suggestions || []); setDismissed(d.dismissed || []); setDismissedCount(d.dismissedCount || 0);
    } catch { setMessage('Could not load suggestions.'); }
    setLoading(false);
  }, [apiUrl, nodeIds, showDismissed]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const sources = useMemo(() => Array.from(new Set(items.map(i => i.source))).sort(), [items]);
  const shown = source ? items.filter(i => i.source === source) : items;
  const toggle = (key: string) => setSelected(prev => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  const allShownSelected = shown.length > 0 && shown.every(i => selected.has(i.key));

  const act = async (action: 'keep' | 'dismiss' | 'restore', keys: string[]) => {
    if (!keys.length) return;
    setBusy(true); setMessage('');
    try {
      const r = await fetch(`${apiUrl}/api/mindmap/quiz/suggestions/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keys }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || `Error ${r.status}`);
      setMessage(action === 'keep' ? `✓ Added ${d.added} question${d.added === 1 ? '' : 's'} to your decks.`
        : action === 'dismiss' ? `Dismissed ${keys.length}.` : `Restored ${keys.length}.`);
      setSelected(new Set());
      await load();
      if (action !== 'restore') onChanged();
    } catch (e: any) { setMessage(e.message); }
    setBusy(false);
  };

  const row = (s: Suggestion, isDismissed = false) => (
    <div key={s.key} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderBottom: '1px solid #333', alignItems: 'flex-start', opacity: isDismissed ? 0.7 : 1 }}>
      {!isDismissed && <input type="checkbox" checked={selected.has(s.key)} onChange={() => toggle(s.key)} style={{ marginTop: 3 }} aria-label="Select" />}
      <div style={{ flex: 1, minWidth: 0, cursor: 'pointer' }} onClick={() => setOpen(o => (o === s.key ? null : s.key))}>
        <div style={{ color: '#fff' }}>
          <span title={KIND_INFO[s.kind]?.name} style={{ marginRight: 6 }}>{KIND_INFO[s.kind]?.icon}</span>
          <MathText text={s.question} />
        </div>
        <div style={{ color: '#777', fontSize: 11, marginTop: 3 }}>
          <span style={{ color: '#a78bfa' }}>{cellLabel(s.lleLevel, s.lleRep)}</span> · {s.source} · {s.nodeName}
          {open !== s.key && <span style={{ color: '#555' }}> · click to see the answer</span>}
        </div>
        {open === s.key && (
          <div style={{ marginTop: 6, background: '#1e1e2e', borderRadius: 4, padding: '6px 8px', color: '#bbb' }}>
            {s.kind === 'choice'
              ? (s.spec?.choices || []).map((c: any, i: number) => <div key={i} style={{ color: c.correct ? '#86efac' : '#999' }}>{c.correct ? '✓' : '○'} {c.text}</div>)
              : <MathText text={s.answer} />}
          </div>
        )}
      </div>
      {isDismissed
        ? <button onClick={() => act('restore', [s.key])} disabled={busy} style={{ ...btn, padding: '4px 10px', background: '#333', color: '#ccc' }}>Restore</button>
        : <>
            <button onClick={() => act('keep', [s.key])} disabled={busy} title="Keep" style={{ ...btn, padding: '4px 10px', background: '#14532d', color: '#86efac' }}>✓</button>
            <button onClick={() => act('dismiss', [s.key])} disabled={busy} title="Dismiss" style={{ ...btn, padding: '4px 10px', background: '#333', color: '#999' }}>✕</button>
          </>}
    </div>
  );

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box} role="dialog" aria-label="Suggested questions">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h3 style={{ color: '#fff', margin: 0 }}>✨ Suggested questions — {deckTitle}</h3>
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
              Made from descriptions, sub-nodes, your link lines and lesson plans. Keep the useful ones; kept cards update when the map changes.
            </div>
          </div>
          <button onClick={onClose} style={{ ...btn, background: 'none', color: '#888', fontSize: 15 }}>✕</button>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '12px 0', flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input type="checkbox" checked={allShownSelected} onChange={() => setSelected(prev => {
              const n = new Set(prev); shown.forEach(i => (allShownSelected ? n.delete(i.key) : n.add(i.key))); return n;
            })} /> All
          </label>
          <select value={source} onChange={e => setSource(e.target.value)}
            style={{ background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '5px 7px' }}>
            <option value="">Every kind ({items.length})</option>
            {sources.map(s => <option key={s} value={s}>{s} ({items.filter(i => i.source === s).length})</option>)}
          </select>
          <button onClick={() => act('keep', Array.from(selected))} disabled={busy || !selected.size}
            style={{ ...btn, background: selected.size ? '#16a34a' : '#333', color: selected.size ? '#fff' : '#777' }}>✓ Keep selected ({selected.size})</button>
          <button onClick={() => act('dismiss', Array.from(selected))} disabled={busy || !selected.size}
            style={{ ...btn, background: '#333', color: selected.size ? '#ddd' : '#777' }}>✕ Dismiss selected</button>
          <span style={{ flex: 1 }} />
          {dismissedCount > 0 && (
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#999' }}>
              <input type="checkbox" checked={showDismissed} onChange={e => setShowDismissed(e.target.checked)} /> Show dismissed ({dismissedCount})
            </label>
          )}
        </div>
        {message && <div style={{ color: message.startsWith('✓') ? '#86efac' : '#f59e0b', marginBottom: 8 }}>{message}</div>}

        <div style={{ flex: 1, overflow: 'auto', background: '#232333', borderRadius: 6 }}>
          {loading && <div style={{ padding: 24, color: '#888', textAlign: 'center' }}>Looking through your map…</div>}
          {!loading && !items.length && (
            <div style={{ padding: 28, color: '#777', textAlign: 'center', lineHeight: 1.7 }}>
              Nothing new to suggest here.<br />
              Questions come from: a node&apos;s <b>description</b> · its <b>sub-nodes</b> · <b>Prerequisite</b>, <b>Causes</b> and <b>Example of</b> links ·
              other links with a <b>label</b> · <b>🗂 lesson plans</b> with 3+ lessons.
            </div>
          )}
          {!loading && shown.map(s => row(s))}
          {!loading && showDismissed && dismissed.length > 0 && (
            <>
              <div style={{ padding: '10px 12px', color: '#888', fontSize: 12, textTransform: 'uppercase', background: '#2a2a3a' }}>Dismissed</div>
              {dismissed.map(s => row(s, true))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}