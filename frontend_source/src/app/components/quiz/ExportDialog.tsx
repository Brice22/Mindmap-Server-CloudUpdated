'use client';

// ============================================================
// 📤 EXPORT FOR AI - your answers as a report an AI can analyse
// ============================================================
// Builds one Markdown report (this deck or everything, last 7–365 days):
//   - what LLE is (so the AI reads your data the way you mean it)
//   - summary, LLE coverage + accuracy per cell, what failed
//   - every answer: question, your numbers, what you answered, the right
//     answer, right/wrong, rating, seconds, what failed
//   - weakest questions, synthesis answers
//   - a request at the end asking for a mechanism-level diagnosis
// 📋 Copy → paste into a chat with Claude (or any AI). ⬇ .md / .json to keep or upload.
// ============================================================

import React, { useState } from 'react';
import { LLE_LEVELS, LLE_REPS, MECHANISMS, KIND_INFO, levelName, repName } from '@/lib/lle';

interface Props {
  apiUrl: string;
  deckTitle: string;
  deckNodeIds: number[] | null;     // null = all
  onClose: () => void;
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 };
const box: React.CSSProperties = { background: '#2a2a3a', padding: 22, borderRadius: 8, width: 520, maxWidth: '94vw', border: '1px solid #444', color: '#ccc', fontSize: 13 };
const btn: React.CSSProperties = { border: 'none', padding: '8px 14px', borderRadius: 5, cursor: 'pointer', fontSize: 13 };

const oneLine = (s: any, max = 400) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const cell = (l?: number | null, r?: string | null) => (l ? `L${l} ${levelName(l)}${r ? ` × ${repName(r)}` : ''}` : r ? repName(r) : 'untagged');
const day = (d: string) => new Date(d).toISOString().slice(0, 16).replace('T', ' ');
const RATING = ['', 'Forgot', 'Hard', 'Good', 'Easy'];

// Copy text: the clipboard API needs https, so on plain http fall back to the older copy command
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch {}
  ta.remove();
  return ok;
}

function buildMarkdown(d: any, title: string) {
  const L: string[] = [];
  const reviews: any[] = d.reviews || [];
  const answered = reviews.length;
  const right = reviews.filter(r => r.correct).length;
  const secs = reviews.map(r => r.seconds).filter((s: any) => Number.isFinite(s));
  const median = secs.length ? secs.sort((a: number, b: number) => a - b)[Math.floor(secs.length / 2)] : null;

  L.push(`# Study results — ${title} (last ${d.days} days)`, '');
  L.push(`Exported from HServer Quiz Center on ${new Date().toISOString().slice(0, 10)}.`, '');
  L.push('## How to read this', '');
  L.push('I use the **LLE framework** (my extension of Dr. Ming-Jer Wang\'s Learning Mechanism Taxonomy): every question tests one cell of',
    '**5 levels × 7 representations**. Levels: ' + LLE_LEVELS.map(l => `L${l.level} ${l.name} (${l.hint.toLowerCase()})`).join('; ') + '.',
    'Representations: ' + LLE_REPS.map(r => `${r.name} (${r.hint.toLowerCase()})`).join('; ') + '.', '');
  L.push('When I miss a question I record **which mechanism failed**: ' + MECHANISMS.map(m => `${m.label} = ${m.hint.toLowerCase()}`).join('; ') + '.',
    'Ratings: 1 Forgot, 2 Hard, 3 Good, 4 Easy (spaced repetition, SM-2). Formats: ' + Object.values(KIND_INFO).map(k => k.name).join(', ') + '.',
    'Numeric questions get new numbers every time; the numbers I got and the correct answer are in the "My answer" column.', '');

  L.push('## Summary', '');
  L.push(`- Answers: ${answered} · right: ${right} (${answered ? Math.round((right / answered) * 100) : 0}%)${median != null ? ` · median time ${median}s` : ''}`);
  L.push(`- Questions in scope: ${(d.questions || []).length} (untagged: ${d.coverage?.untagged ?? 0})`);
  L.push(`- Synthesis answers: ${(d.reflections || []).length}`, '');

  // Coverage table
  const cov = d.coverage || { cells: [], accuracy: [], mechanisms: [] };
  L.push('## LLE coverage (questions · % right)', '');
  L.push('| Level | ' + LLE_REPS.map(r => r.name).join(' | ') + ' |');
  L.push('|---|' + LLE_REPS.map(() => '---').join('|') + '|');
  for (const l of LLE_LEVELS) {
    const row = LLE_REPS.map(r => {
      const n = cov.cells.filter((c: any) => c.level === l.level && c.rep === r.rep).reduce((s: number, c: any) => s + c.n, 0);
      const a = cov.accuracy.find((x: any) => x.level === l.level && x.rep === r.rep);
      return n ? `${n}${a?.answered ? ` · ${Math.round((a.right / a.answered) * 100)}%` : ''}` : '—';
    });
    L.push(`| L${l.level} ${l.name} | ${row.join(' | ')} |`);
  }
  L.push('');

  // Mechanisms
  const mechCounts = MECHANISMS.map(m => ({ m, n: reviews.filter(r => r.mechanism === m.key).length })).filter(x => x.n);
  L.push('## What failed when I missed', '');
  if (mechCounts.length) for (const { m, n } of mechCounts) L.push(`- ${m.label}: ${n}`);
  else L.push('- (no misses with a mechanism recorded in this period)');
  L.push('');

  // Weakest questions
  const byQ = new Map<number, { q: any; n: number; wrong: number }>();
  for (const r of reviews) {
    const e = byQ.get(r.question_id) || { q: r, n: 0, wrong: 0 };
    e.n++; if (!r.correct) e.wrong++;
    byQ.set(r.question_id, e);
  }
  const weakest = Array.from(byQ.values()).filter(e => e.wrong).sort((a, b) => b.wrong / b.n - a.wrong / a.n || b.wrong - a.wrong).slice(0, 15);
  L.push('## Weakest questions', '');
  if (weakest.length) {
    L.push('| Node | Question | Cell | Wrong / answered |', '|---|---|---|---|');
    for (const e of weakest) L.push(`| ${oneLine(e.q.node, 60)} | ${oneLine(e.q.question, 160).replace(/\|/g, '/')} | ${cell(e.q.lle_level, e.q.lle_rep)} | ${e.wrong}/${e.n} |`);
  } else L.push('- (none missed)');
  L.push('');

  // Every answer
  L.push('## Every answer', '');
  L.push('| When | Node | Format | Cell | Question | My answer | Correct answer | Right? | Rating | Failed | Sec |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of reviews) {
    L.push(`| ${day(r.reviewed_at)} | ${oneLine(r.node, 40)} | ${KIND_INFO[r.kind]?.name || r.kind} | ${cell(r.lle_level, r.lle_rep)} | `
      + `${oneLine(r.question, 200).replace(/\|/g, '/')} | ${oneLine(r.response, 300).replace(/\|/g, '/') || '—'} | ${oneLine(r.answer, 200).replace(/\|/g, '/')} | `
      + `${r.correct ? '✓' : '✗'} | ${RATING[r.rating] || ''} | ${r.mechanism || ''} | ${r.seconds ?? ''} |`);
  }
  L.push('');

  // Synthesis
  L.push('## Level-4 synthesis answers', '');
  if ((d.reflections || []).length) for (const s of d.reflections) L.push(`**${day(s.created_at)} — ${s.prompt}**`, '', s.response, '');
  else L.push('- (none in this period)', '');

  L.push('## What I would like from you', '');
  L.push('Diagnose my learning **by mechanism, not by symptom**:',
    '1. Which LLE cells and mechanisms are weakest, and what pattern links my misses (same concept? same representation? same kind of step)?',
    '2. For numeric misses, look at my answers vs. the correct ones: is it a unit/sign/order-of-magnitude slip, a formula choice (Judgment), or the procedure itself?',
    '3. Critique my synthesis answers adversarially: what is wrong, missing or hand-wavy?',
    '4. Which empty or weak cells should I fill next, with 3–5 concrete questions I should add (say the cell and format for each)?',
    '5. A short plan for my next sessions (what to review, in what order).');
  return L.join('\n');
}

export default function ExportDialog({ apiUrl, deckTitle, deckNodeIds, onClose }: Props) {
  const [scope, setScope] = useState<'deck' | 'all'>(deckNodeIds ? 'deck' : 'all');
  const [days, setDays] = useState(30);
  const [state, setState] = useState<{ busy: boolean; msg: string }>({ busy: false, msg: '' });

  const fetchData = async () => {
    const ids = scope === 'deck' && deckNodeIds ? deckNodeIds.join(',') : '';
    const r = await fetch(`${apiUrl}/api/mindmap/quiz/export?days=${days}${ids ? `&nodeIds=${ids}` : ''}`);
    if (!r.ok) throw new Error(`Export failed (${r.status})`);
    return r.json();
  };
  const title = scope === 'deck' && deckNodeIds ? deckTitle : 'All decks';
  const fileBase = `hserver-quiz-${title.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase()}-${new Date().toISOString().slice(0, 10)}`;

  const download = (text: string, name: string, type: string) => {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const run = async (what: 'copy' | 'md' | 'json') => {
    setState({ busy: true, msg: '' });
    try {
      const data = await fetchData();
      if (what === 'json') { download(JSON.stringify(data, null, 2), `${fileBase}.json`, 'application/json'); setState({ busy: false, msg: '✓ Downloaded' }); return; }
      const md = buildMarkdown(data, title);
      if (what === 'md') { download(md, `${fileBase}.md`, 'text/markdown'); setState({ busy: false, msg: '✓ Downloaded' }); return; }
      if (await copyText(md)) setState({ busy: false, msg: `✓ Copied (${data.reviews.length} answers) — paste it into a chat with Claude` });
      else { download(md, `${fileBase}.md`, 'text/markdown'); setState({ busy: false, msg: "This browser wouldn't copy, so it was downloaded instead — attach the file to the chat." }); }
    } catch (e: any) {
      setState({ busy: false, msg: e.message });
    }
  };

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box}>
        <h3 style={{ color: '#fff', margin: '0 0 6px' }}>📤 Export for AI analysis</h3>
        <div style={{ color: '#888', marginBottom: 14, lineHeight: 1.5 }}>
          One report with your answers, LLE coverage, what failed and your synthesis answers — plus a request asking the AI
          to diagnose by mechanism. Paste it into a chat with Claude, or download it.
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
          <label>Scope{' '}
            <select value={scope} onChange={e => setScope(e.target.value as any)} style={{ background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: 5 }}>
              {deckNodeIds && <option value="deck">This deck: {deckTitle}</option>}
              <option value="all">All decks</option>
            </select>
          </label>
          <label>Period{' '}
            <select value={days} onChange={e => setDays(Number(e.target.value))} style={{ background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: 5 }}>
              {[7, 30, 90, 365, 3650].map(d => <option key={d} value={d}>{d === 3650 ? 'Everything' : `Last ${d} days`}</option>)}
            </select>
          </label>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button disabled={state.busy} onClick={() => run('copy')} style={{ ...btn, background: '#7c3aed', color: '#fff' }}>📋 Copy for AI chat</button>
          <button disabled={state.busy} onClick={() => run('md')} style={{ ...btn, background: '#333', color: '#ddd' }}>⬇ Report (.md)</button>
          <button disabled={state.busy} onClick={() => run('json')} style={{ ...btn, background: '#333', color: '#ddd' }}>⬇ Raw data (.json)</button>
          <div style={{ flex: 1 }} />
          <button onClick={onClose} style={{ ...btn, background: 'none', color: '#888' }}>Close</button>
        </div>
        {state.busy && <div style={{ color: '#888', marginTop: 10 }}>Building the report…</div>}
        {state.msg && <div style={{ color: state.msg.startsWith('✓') ? '#4ade80' : '#f59e0b', marginTop: 10 }}>{state.msg}</div>}
      </div>
    </div>
  );
}