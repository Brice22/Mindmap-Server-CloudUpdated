'use client';

//  ============================================================
// 🪜 LLE LADDER - go through every level × representation for one topic
// ============================================================
// 35 steps: L1 Meaning · Verbal → … → L5 Creation · Intuitive. Each step:
//   - what to write there (with an example question)
//   - ✍️ Note   → saved in the node's "🪜 LLE notes" doc under
//                 "L{n} {Level}" → "{Representation}". Lines written as
//                 cards (question :: answer, {{blank}}) become questions in
//                 that cell automatically.
//   - ➕ Question → a quick recall card in that cell (or the full editor
//                 for numeric / explain / multiple choice)
// The grid on the left shows which cells have notes (●) and questions (n).
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import MathText from '@/lib/MathText';
import { LLE_LEVELS, LLE_REPS, CELL_PROMPTS, LMT_OF_LEVEL, LADDER, KIND_INFO } from '@/lib/lle';

interface LadderCard { id: string; question: string; answer: string; kind: string; lleLevel: number | null; lleRep: string | null; nodeId: number | null }

interface Props {
  apiUrl: string;
  node: { id: number; name: string };
  cards: LadderCard[];                       // the topic's questions (node + sub-nodes)
  onClose: () => void;
  onChanged: () => void;                     // reload cards
  onFullEditor: (level: number, rep: string) => void;
  onOpenDocs?: (nodeId: number, docId?: number | null) => void;
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9997 };
const box: React.CSSProperties = { background: '#2a2a3a', padding: 18, borderRadius: 8, width: 1000, maxWidth: '97vw', height: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #444', color: '#ccc', fontSize: 13 };
const btn: React.CSSProperties = { border: 'none', padding: '7px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 13 };
const field: React.CSSProperties = { background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '7px 9px', fontSize: 13, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit' };
const key = (l: number, r: string) => `${l}:${r}`;

export default function LleLadder({ apiUrl, node, cards, onClose, onChanged, onFullEditor, onOpenDocs }: Props) {
  const [notes, setNotes] = useState<Record<string, string[]>>({});
  const [docId, setDocId] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [note, setNote] = useState('');
  const [q, setQ] = useState('');
  const [a, setA] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [firstLoad, setFirstLoad] = useState(false);
  const jumped = useRef(false);

  const loadNotes = useCallback(async () => {
    try {
      const r = await fetch(`${apiUrl}/api/mindmap/study/lle-notes/${node.id}`);
      if (r.ok) { const d = await r.json(); setNotes(d.cells || {}); setDocId(d.docId ?? null); }
    } catch {}
    setFirstLoad(true);
  }, [apiUrl, node.id]);
  useEffect(() => { loadNotes(); }, [loadNotes]);

  const countIn = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of cards) if (c.lleLevel && c.lleRep) m[key(c.lleLevel, c.lleRep)] = (m[key(c.lleLevel, c.lleRep)] || 0) + 1;
    return m;
  }, [cards]);
  const filled = (k: string) => (notes[k]?.length || 0) > 0 || (countIn[k] || 0) > 0;
  const done = LADDER.filter(c => filled(key(c.level, c.rep))).length;

  // Open on the first empty cell (once — never jump while you're working)
  useEffect(() => {
    if (!firstLoad || jumped.current) return;
    jumped.current = true;
    const first = LADDER.findIndex(c => !filled(key(c.level, c.rep)));
    if (first > 0) setStep(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstLoad]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.target as HTMLElement)?.closest?.('input, textarea')) return;
      if (e.key === 'ArrowRight') setStep(s => Math.min(LADDER.length - 1, s + 1));
      if (e.key === 'ArrowLeft') setStep(s => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cell = LADDER[step];
  const k = key(cell.level, cell.rep);
  const lvl = LLE_LEVELS.find(l => l.level === cell.level)!;
  const rep = LLE_REPS.find(r => r.rep === cell.rep)!;
  const tip = CELL_PROMPTS[k];
  const here = cards.filter(c => c.lleLevel === cell.level && c.lleRep === cell.rep);
  const go = (i: number) => { setStep(i); setMessage(''); };
  const nextEmpty = () => {
    for (let j = 1; j <= LADDER.length; j++) {
      const i = (step + j) % LADDER.length;
      if (!filled(key(LADDER[i].level, LADDER[i].rep))) return go(i);
    }
    setMessage('Every cell has something — the whole ladder is covered.');
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    setBusy(true); setMessage('');
    try {
      const r = await fetch(`${apiUrl}/api/mindmap/study/lle-notes`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId: node.id, level: cell.level, rep: cell.rep, text: note }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || `Error ${r.status}`);
      setNote(''); setMessage('✓ Note saved'); await loadNotes();
      setTimeout(onChanged, 1200);   // card lines in the note become questions once the doc is processed
    } catch (e: any) { setMessage(e.message); }
    setBusy(false);
  };

  const saveQuestion = async () => {
    if (!q.trim() || !a.trim()) return setMessage('Write the question and the answer');
    setBusy(true); setMessage('');
    try {
      const r = await fetch(`${apiUrl}/api/mindmap/quiz/questions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'recall', question: q.trim(), answer: a.trim(), lleLevel: cell.level, lleRep: cell.rep, nodeId: node.id, nodeName: node.name }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || `Error ${r.status}`);
      setQ(''); setA(''); setMessage('✓ Question added'); onChanged();
    } catch (e: any) { setMessage(e.message); }
    setBusy(false);
  };

  const fill = (s: string) => s.replace(/\bX\b/g, node.name);

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box} role="dialog" aria-label="LLE ladder">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <h3 style={{ color: '#fff', margin: 0 }}>🪜 LLE ladder — {node.name}</h3>
            <div style={{ color: '#888', fontSize: 12, marginTop: 3 }}>{done} of 35 cells have a note or a question · ← → to move</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {docId != null && onOpenDocs && <button onClick={() => onOpenDocs(node.id, docId)} style={{ ...btn, background: '#333', color: '#ccc' }}>📄 Open notes doc</button>}
            <button onClick={onClose} style={{ ...btn, background: 'none', color: '#888', fontSize: 15 }}>✕</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, marginTop: 12 }}>
          {/* GRID */}
          <div style={{ flexShrink: 0 }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
              <thead>
                <tr><th />{LLE_REPS.map(r => <th key={r.rep} title={r.hint} style={{ color: '#888', fontSize: 10, fontWeight: 400, writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 70 }}>{r.name}</th>)}</tr>
              </thead>
              <tbody>
                {LLE_LEVELS.map(l => (
                  <tr key={l.level}>
                    <td style={{ color: '#aaa', fontSize: 11, paddingRight: 4, whiteSpace: 'nowrap' }} title={LMT_OF_LEVEL[l.level]}>L{l.level} {l.name}</td>
                    {LLE_REPS.map(r => {
                      const kk = key(l.level, r.rep);
                      const i = LADDER.findIndex(c => c.level === l.level && c.rep === r.rep);
                      const n = countIn[kk] || 0, hasNote = (notes[kk]?.length || 0) > 0;
                      return (
                        <td key={r.rep} onClick={() => go(i)} title={`L${l.level} ${l.name} · ${r.name}: ${n} question(s)${hasNote ? ', notes' : ''}`}
                          style={{ width: 26, height: 24, textAlign: 'center', cursor: 'pointer', borderRadius: 4, fontSize: 10,
                            background: i === step ? '#7c3aed' : n ? '#14532d' : hasNote ? '#1e3a5f' : '#1e1e2e',
                            color: i === step ? '#fff' : n ? '#86efac' : '#93c5fd', outline: i === step ? '2px solid #c4b5fd' : 'none' }}>
                          {n || (hasNote ? '●' : '')}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ color: '#666', fontSize: 11, marginTop: 6, lineHeight: 1.6 }}>
              <span style={{ color: '#86efac' }}>n</span> questions · <span style={{ color: '#93c5fd' }}>●</span> notes only · empty = still to do
            </div>
            <button onClick={nextEmpty} style={{ ...btn, background: '#333', color: '#ddd', marginTop: 8, width: '100%' }}>⏭ Next empty cell</button>
          </div>

          {/* CELL */}
          <div style={{ flex: 1, minWidth: 0, overflow: 'auto', paddingRight: 4 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
              <span style={{ color: '#fff', fontSize: 18, fontWeight: 700 }}>L{cell.level} {lvl.name} · {rep.name}</span>
              <span style={{ color: '#a78bfa', fontSize: 12 }}>{LMT_OF_LEVEL[cell.level]}</span>
              <span style={{ color: '#666', fontSize: 12 }}>step {step + 1} / 35</span>
            </div>
            <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>{lvl.hint} — {rep.hint}</div>
            <div style={{ background: '#1e1e2e', borderLeft: '3px solid #7c3aed', borderRadius: 4, padding: '10px 12px', margin: '10px 0' }}>
              <div style={{ color: '#e9d5ff' }}>{fill(tip.prompt)}</div>
              <div style={{ color: '#777', fontSize: 12, marginTop: 6 }}>Example question (CNC): <i>{tip.example}</i></div>
            </div>

            {/* existing */}
            {(notes[k]?.length || 0) > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>Your notes here</div>
                {notes[k].map((t, i) => <div key={i} style={{ color: '#bbb', padding: '2px 0' }}>• <MathText text={t} /></div>)}
              </div>
            )}
            {here.length > 0 && (
              <div style={{ marginBottom: 10 }}>
                <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>Questions here ({here.length})</div>
                {here.slice(0, 8).map(c => (
                  <div key={c.id} style={{ color: '#bbb', padding: '2px 0' }}>{KIND_INFO[c.kind]?.icon} <MathText text={c.question} /></div>
                ))}
                {here.length > 8 && <div style={{ color: '#666', fontSize: 11 }}>…and {here.length - 8} more</div>}
              </div>
            )}

            {/* note */}
            <div style={{ color: '#aaa', fontSize: 12, margin: '12px 0 4px' }}>✍️ Note for this cell <span style={{ color: '#666' }}>— one idea per line; a line like <code>term :: answer</code> or with <code>{'{{blank}}'}</code> also becomes a question here</span></div>
            <textarea value={note} onChange={e => setNote(e.target.value)} rows={4} style={field}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveNote(); }} placeholder={fill(tip.prompt)} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button onClick={saveNote} disabled={busy || !note.trim()} style={{ ...btn, background: note.trim() ? '#2563eb' : '#333', color: '#fff' }}>Save note <span style={{ opacity: 0.6, fontSize: 11 }}>Ctrl+Enter</span></button>
            </div>

            {/* quick question */}
            <div style={{ color: '#aaa', fontSize: 12, margin: '16px 0 4px' }}>➕ Question in this cell</div>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder={tip.example} style={field} />
            <textarea value={a} onChange={e => setA(e.target.value)} rows={2} placeholder="Answer" style={{ ...field, marginTop: 6 }} />
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <button onClick={saveQuestion} disabled={busy} style={{ ...btn, background: '#16a34a', color: '#fff' }}>Add question</button>
              <button onClick={() => onFullEditor(cell.level, cell.rep)} style={{ ...btn, background: '#333', color: '#ddd' }}>🔢 ✍️ 🔘 Other formats…</button>
            </div>
            {message && <div style={{ color: message.startsWith('✓') || message.startsWith('Every') ? '#86efac' : '#f87171', marginTop: 8 }}>{message}</div>}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
              <button onClick={() => go(Math.max(0, step - 1))} disabled={step === 0} style={{ ...btn, background: '#333', color: '#ccc' }}>← Previous</button>
              <button onClick={() => go(Math.min(LADDER.length - 1, step + 1))} disabled={step === LADDER.length - 1} style={{ ...btn, background: '#7c3aed', color: '#fff' }}>Next cell →</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}