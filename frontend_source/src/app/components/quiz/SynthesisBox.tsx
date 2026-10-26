'use client';

// ============================================================
// 🧠 LEVEL-4 SYNTHESIS - the last question of every session
// ============================================================
// Picks two nodes you just studied (the two with the most questions
// in the session; with only one, it and its parent) and asks you to
// connect them. Not graded — you write it, it's saved, and you can
// read past answers later (GET /api/mindmap/quiz/reflections).
// ============================================================

import React, { useMemo, useState } from 'react';
import type { Node } from '@/lib/types';

interface Props {
  apiUrl: string;
  studiedNodeIds: number[];        // in session order, repeats allowed
  nodes: Node[];
}

const metaOf = (n?: Node): any => (typeof n?.metadata === 'string' ? JSON.parse(n.metadata || '{}') : n?.metadata || {});

export default function SynthesisBox({ apiUrl, studiedNodeIds, nodes }: Props) {
  const pair = useMemo(() => {
    const counts = new Map<number, number>();
    for (const id of studiedNodeIds) counts.set(id, (counts.get(id) || 0) + 1);
    const ranked = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([id]) => nodes.find(n => n.id === id)).filter(Boolean) as Node[];
    if (ranked.length >= 2) return [ranked[0], ranked[1]];
    if (ranked.length === 1) {
      const parentName = String(metaOf(ranked[0]).parent || '').toLowerCase();
      const parent = parentName ? nodes.find(n => n.name.toLowerCase() === parentName) : undefined;
      return parent ? [ranked[0], parent] : [ranked[0]];
    }
    return [];
  }, [studiedNodeIds, nodes]);

  const prompt = pair.length === 2
    ? `How do “${pair[0].name}” and “${pair[1].name}” connect? What do they share, where do they differ, and where would using one in place of the other break down?`
    : pair.length === 1
      ? `Explain “${pair[0].name}” to someone who only knows its prerequisites: what problem does it solve, what is the key idea, and where does it stop working?`
      : '';

  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  if (!prompt) return null;

  const save = async () => {
    setState('saving');
    try {
      const r = await fetch(`${apiUrl}/api/mindmap/quiz/reflections`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, response: text, nodeIds: pair.map(n => n.id) }),
      });
      setState(r.ok ? 'saved' : 'error');
    } catch { setState('error'); }
  };

  return (
    <div style={{ width: '100%', maxWidth: 640, background: '#2a2a3a', borderRadius: 8, padding: 16, border: '1px solid #4c3d7a', marginBottom: 24 }}>
      <div style={{ color: '#c4b5fd', fontSize: 12, textTransform: 'uppercase', marginBottom: 6 }}>🧠 Level-4 synthesis</div>
      <div style={{ color: '#fff', lineHeight: 1.5 }}>{prompt}</div>
      {state === 'saved'
        ? <div style={{ color: '#4ade80', marginTop: 10 }}>✓ Saved with {pair.map(n => n.name).join(' and ')}.</div>
        : <>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={5} placeholder="Write it out in your own words…"
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 10, background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 6, padding: 10, fontSize: 14, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
              <button onClick={save} disabled={!text.trim() || state === 'saving'}
                style={{ border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', background: text.trim() ? '#7c3aed' : '#333', color: '#fff' }}>
                {state === 'saving' ? 'Saving…' : 'Save my answer'}
              </button>
              {state === 'error' && <span style={{ color: '#f87171', fontSize: 12 }}>Couldn&apos;t save — try again</span>}
            </div>
          </>}
    </div>
  );
}