'use client';

// ============================================================
// 🧩 LLE CHART - 5 levels × 7 representations for a deck
// ============================================================
// Each cell: how many questions test it, and how often you got them
// right (last 90 days):  green ≥ 80 % · amber 50–79 % · red < 50 %
// · grey = questions but no answers yet · empty = no questions (a gap).
// Click a cell to write a question for it.
// Below: what failed when you missed (last 30 days) — the mechanism,
// not the symptom.
// ============================================================

import React, { useEffect, useState } from 'react';
import { LLE_LEVELS, LLE_REPS, MECHANISMS } from '@/lib/lle';

interface Props {
  apiUrl: string;
  nodeIds: number[] | null;              // null = every node
  refreshKey: number;
  onCell: (level: number, rep: string) => void;
}

interface Coverage {
  cells: { level: number; rep: string | null; kind: string; n: number }[];
  accuracy: { level: number; rep: string | null; answered: number; right: number }[];
  mechanisms: { mechanism: string; n: number }[];
  untagged: number;
}

export default function LleChart({ apiUrl, nodeIds, refreshKey, onCell }: Props) {
  const [data, setData] = useState<Coverage | null>(null);
  const key = nodeIds ? nodeIds.join(',') : '';

  useEffect(() => {
    let alive = true;
    fetch(`${apiUrl}/api/mindmap/quiz/coverage${key ? `?nodeIds=${key}` : ''}`)
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (alive) setData(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [apiUrl, key, refreshKey]);

  if (!data) return <div style={{ color: '#777', fontSize: 12 }}>Loading the LLE chart…</div>;

  const count = (l: number, r: string) => data.cells.filter(c => c.level === l && c.rep === r).reduce((s, c) => s + c.n, 0);
  const acc = (l: number, r: string) => data.accuracy.find(a => a.level === l && a.rep === r);
  const rowNoRep = (l: number) => data.cells.filter(c => c.level === l && !c.rep).reduce((s, c) => s + c.n, 0);
  const totalTagged = data.cells.reduce((s, c) => s + c.n, 0);
  const filled = LLE_LEVELS.reduce((s, l) => s + LLE_REPS.filter(r => count(l.level, r.rep) > 0).length, 0);
  const mechTotal = data.mechanisms.reduce((s, m) => s + m.n, 0);

  const color = (l: number, r: string) => {
    const n = count(l, r);
    if (!n) return { bg: 'transparent', fg: '#555' };
    const a = acc(l, r);
    if (!a || !a.answered) return { bg: '#3a3a4e', fg: '#ccc' };
    const pct = a.right / a.answered;
    return pct >= 0.8 ? { bg: '#14532d', fg: '#bbf7d0' } : pct >= 0.5 ? { bg: '#713f12', fg: '#fde68a' } : { bg: '#7f1d1d', fg: '#fecaca' };
  };

  return (
    <div>
      <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>
        {filled} of 35 cells have questions · {totalTagged} tagged{data.untagged ? ` · ${data.untagged} not tagged yet (✎ on a question to tag it)` : ''} · click a cell to add a question there
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr>
              <th />
              {LLE_REPS.map(r => <th key={r.rep} title={r.hint} style={{ color: '#aaa', fontWeight: 'normal', padding: '4px 6px' }}>{r.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {LLE_LEVELS.map(l => (
              <tr key={l.level}>
                <td title={l.hint} style={{ color: '#aaa', padding: '4px 8px', whiteSpace: 'nowrap' }}>
                  L{l.level} {l.name}{rowNoRep(l.level) ? <span style={{ color: '#666' }}> (+{rowNoRep(l.level)})</span> : null}
                </td>
                {LLE_REPS.map(r => {
                  const n = count(l.level, r.rep);
                  const a = acc(l.level, r.rep);
                  const c = color(l.level, r.rep);
                  return (
                    <td key={r.rep} onClick={() => onCell(l.level, r.rep)}
                      title={`${l.name} × ${r.name}: ${n} question${n === 1 ? '' : 's'}${a?.answered ? `, ${Math.round((a.right / a.answered) * 100)}% right (${a.answered} answers)` : ''} — click to add one`}
                      style={{ width: 64, height: 36, textAlign: 'center', cursor: 'pointer', border: '1px solid #3a3a4e', background: c.bg, color: c.fg }}>
                      {n ? <>{n}{a?.answered ? <div style={{ fontSize: 10, opacity: 0.8 }}>{Math.round((a.right / a.answered) * 100)}%</div> : null}</> : '+'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14 }}>
        <div style={{ color: '#aaa', fontSize: 12, marginBottom: 6 }}>What failed when you missed (last 30 days)</div>
        {mechTotal === 0
          ? <div style={{ color: '#666', fontSize: 12 }}>Nothing yet — after a miss, pick what failed and it shows up here.</div>
          : MECHANISMS.map(m => {
              const n = data.mechanisms.find(x => x.mechanism === m.key)?.n || 0;
              if (!n) return null;
              return (
                <div key={m.key} title={m.hint} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, fontSize: 12 }}>
                  <span style={{ width: 90, color: '#ccc' }}>{m.label}</span>
                  <div style={{ flex: 1, maxWidth: 260, height: 10, background: '#333', borderRadius: 5 }}>
                    <div style={{ width: `${(n / mechTotal) * 100}%`, height: '100%', background: '#ef4444', borderRadius: 5 }} />
                  </div>
                  <span style={{ color: '#888' }}>{n}</span>
                </div>
              );
            })}
      </div>
    </div>
  );
}