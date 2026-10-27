'use client';

// ============================================================
// 🧪 QUESTION RUNNER - shows one question during a review
// ============================================================
//   🃏 Recall    think (or type) → Show answer (Space)
//   🔢 Numeric   new numbers every time → type the result → Check (Enter)
//   ✍️ Explain   write it out → Compare → tick what you covered
//   🔘 Choice    pick one (keys A, B, C…) → shows why a wrong pick is wrong
// When the answer is shown it tells the Quiz Center whether you were
// right and suggests a rating (you can still choose any).
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import MathText from '@/lib/MathText';
import { makeInstance, fillTemplate, formatNumber, checkAnswer } from '@/lib/quizMath';
import { KIND_INFO, cellLabel } from '@/lib/lle';
import type { QuizQuestion } from './QuestionEditor';

export interface RevealInfo {
  correct: boolean | null;     // null = you grade yourself
  suggested: number | null;    // 1 Forgot · 2 Hard · 3 Good · 4 Easy
  response: string;
}

interface Props {
  q: QuizQuestion;
  revealed: boolean;
  onReveal: (info: RevealInfo) => void;
}

const card: React.CSSProperties = { width: '100%', maxWidth: 680, minHeight: 260, background: '#2a2a3a', borderRadius: 12, padding: 30, border: '1px solid #444', boxSizing: 'border-box' };
const btn: React.CSSProperties = { border: 'none', padding: '10px 26px', borderRadius: 6, cursor: 'pointer', fontSize: 15 };
const input: React.CSSProperties = { background: '#1e1e2e', color: '#fff', border: '1px solid #555', borderRadius: 6, padding: '10px 12px', fontSize: 16 };

// Same order of choices for the whole time a question is on screen
function shuffled<T>(xs: T[], seed: string) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) | 0;
  return xs.map((x, i) => ({ x, k: Math.sin(h + i * 97) })).sort((a, b) => a.k - b.k).map(o => o.x);
}

export default function QuestionRunner({ q, revealed, onReveal }: Props) {
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<{ ok: boolean; given: number } | null>(null);
  const [typeError, setTypeError] = useState('');
  const [picked, setPicked] = useState<number | null>(null);
  const [written, setWritten] = useState('');
  const [ticks, setTicks] = useState<boolean[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fresh state + fresh numbers for each question
  const instance = useMemo(() => {
    if (q.kind !== 'numeric') return null;
    try { return makeInstance(q.spec); } catch (e: any) { return { error: e.message } as any; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id]);
  const choices = useMemo(() => (q.kind === 'choice' ? shuffled((q.spec?.choices || []) as any[], `${q.id}:${Date.now()}`) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q.id]);
  const checklist: string[] = q.kind === 'explain' ? q.spec?.checklist || [] : [];
  useEffect(() => {
    setTyped(''); setResult(null); setTypeError(''); setPicked(null); setWritten(''); setTicks(checklist.map(() => false));
    setTimeout(() => inputRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id]);

  const shownQuestion = q.kind === 'numeric' && instance && !instance.error ? fillTemplate(q.question, instance.vars) : q.question;

  // --- actions ---
  const revealRecall = () => onReveal({ correct: null, suggested: null, response: written });
  const checkNumeric = () => {
    if (!instance || instance.error) return;
    const r = checkAnswer(typed, instance.answer, q.spec?.tolerancePct ?? 1);
      if (r.error) { setTypeError(r.error); return; }
    setTypeError('');
    setResult({ ok: r.ok, given: r.given });
    // Saved with the answer (for 📤 Export): what you typed, the numbers you got, the right answer
    const numbers = Object.entries(instance.vars).map(([k, v]) => `${k} = ${formatNumber(v as number, 6)}`).join(', ');
    onReveal({ correct: r.ok, suggested: r.ok ? 3 : 1, response: `${typed} (numbers: ${numbers}; correct: ${formatNumber(instance.answer)}${unit})` });
  };
  const pick = (i: number) => {
    if (revealed) return;
    setPicked(i);
    const ok = !!choices[i]?.correct;
    onReveal({ correct: ok, suggested: ok ? 3 : 1, response: String(choices[i]?.text || '') });
  };
  const compareExplain = () => onReveal({ correct: null, suggested: null, response: written });

  // Checklist ticks → suggested rating (after comparing)
   const tickRatio = checklist.length ? ticks.filter(Boolean).length / checklist.length : null;
  useEffect(() => {
    if (q.kind !== 'explain' || !revealed || tickRatio === null) return;
    const covered = checklist.filter((_, i) => ticks[i]);
    const missed = checklist.filter((_, i) => !ticks[i]);
    onReveal({ correct: tickRatio >= 0.9, suggested: tickRatio >= 0.9 ? 3 : tickRatio >= 0.6 ? 2 : 1,
      response: `${written}\n[covered ${covered.length}/${checklist.length}${missed.length ? `; missed: ${missed.join(' | ')}` : ''}]` });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticks]);

  // Keys: Space shows a recall answer; A, B, C… pick a choice
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.('input, textarea')) return;
      if (!revealed && q.kind === 'recall' && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); revealRecall(); }
      if (!revealed && q.kind === 'choice') {
        const i = e.key.toUpperCase().charCodeAt(0) - 65;
        if (e.key.length === 1 && i >= 0 && i < choices.length) { e.preventDefault(); pick(i); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const unit = q.spec?.unit ? ` ${q.spec.unit}` : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: 12, marginBottom: 14 }}>
          <span>{KIND_INFO[q.kind]?.icon} {KIND_INFO[q.kind]?.name}</span>
          <span>{cellLabel(q.lleLevel, q.lleRep)}</span>
        </div>
        <div style={{ color: '#fff', fontSize: 20, lineHeight: 1.5, textAlign: 'center' }}><MathText text={shownQuestion} /></div>
        {q.kind === 'numeric' && instance?.error && <div style={{ color: '#f87171', marginTop: 10, textAlign: 'center' }}>This question's formula has a problem: {instance.error}</div>}

        {/* RECALL: optional typing space */}
        {q.kind === 'recall' && !revealed && (
          <textarea value={written} onChange={e => setWritten(e.target.value)} rows={2} placeholder="(optional) type your answer first"
            style={{ ...input, width: '100%', boxSizing: 'border-box', marginTop: 18, fontSize: 14, resize: 'vertical' }} />
        )}

        {/* NUMERIC */}
        {q.kind === 'numeric' && instance && !instance.error && (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', marginTop: 20 }}>
            <input ref={inputRef} style={{ ...input, width: 200, textAlign: 'center' }} value={typed} disabled={revealed}
              onChange={e => setTyped(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !revealed) checkNumeric(); }} placeholder="your answer" />
            <span style={{ color: '#aaa' }}>{q.spec?.unit}</span>
            {!revealed && <button style={{ ...btn, background: '#0070f3', color: '#fff' }} onClick={checkNumeric}>Check <span style={{ opacity: 0.6, fontSize: 11 }}>(Enter)</span></button>}
          </div>
        )}
        {typeError && <div style={{ color: '#f59e0b', textAlign: 'center', marginTop: 8 }}>{typeError}</div>}

        {/* CHOICE */}
        {q.kind === 'choice' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
            {choices.map((c: any, i: number) => {
              const isPicked = picked === i;
              const bg = !revealed ? '#1e1e2e' : c.correct ? '#14532d' : isPicked ? '#7f1d1d' : '#1e1e2e';
              return (
                <div key={i} onClick={() => pick(i)} style={{ background: bg, border: `1px solid ${isPicked ? '#888' : '#444'}`, borderRadius: 6, padding: '10px 14px', cursor: revealed ? 'default' : 'pointer', color: '#eee' }}>
                  <b style={{ color: '#888', marginRight: 10 }}>{String.fromCharCode(65 + i)}</b><MathText text={c.text} />
                  {revealed && isPicked && !c.correct && c.why && <div style={{ color: '#fca5a5', fontSize: 13, marginTop: 6 }}>Misconception: {c.why}</div>}
                </div>
              );
            })}
          </div>
        )}

        {/* EXPLAIN */}
        {q.kind === 'explain' && (
          <textarea value={written} onChange={e => setWritten(e.target.value)} rows={6} disabled={revealed}
            placeholder="Write your explanation / derivation, then press Compare"
            style={{ ...input, width: '100%', boxSizing: 'border-box', marginTop: 18, fontSize: 14, resize: 'vertical' }} />
        )}

        {/* ANSWER */}
        {revealed && (
          <div style={{ marginTop: 22, borderTop: '1px solid #444', paddingTop: 16 }}>
            {q.kind === 'numeric' && instance && !instance.error && (
              <div style={{ textAlign: 'center', fontSize: 18 }}>
                <span style={{ color: result?.ok ? '#4ade80' : '#f87171' }}>{result?.ok ? '✓ Right' : '✗ Not quite'}</span>
                <span style={{ color: '#ddd' }}> — answer {formatNumber(instance.answer)}{unit}</span>
                {result && !result.ok && Number.isFinite(result.given) && <div style={{ color: '#888', fontSize: 13, marginTop: 4 }}>you gave {formatNumber(result.given)}{unit} · tolerance {q.spec?.tolerancePct ?? 1}%</div>}
              </div>
            )}
            {(q.kind === 'recall' || q.kind === 'explain') && (
              <>
                <div style={{ color: '#888', fontSize: 12, textTransform: 'uppercase', marginBottom: 8 }}>{q.kind === 'explain' ? 'Model answer' : 'Answer'}</div>
                <div style={{ color: '#c4b5fd', fontSize: 17, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}><MathText text={q.answer} /></div>
              </>
            )}
            {q.kind === 'explain' && checklist.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 6 }}>Tick what your answer covered:</div>
                {checklist.map((item, i) => (
                  <label key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', color: '#ddd', marginBottom: 4, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!ticks[i]} onChange={e => setTicks(t => t.map((x, j) => (j === i ? e.target.checked : x)))} />
                    <MathText text={item} />
                  </label>
                ))}
              </div>
            )}
            {q.solution && (
              <div style={{ marginTop: 14, background: '#1e1e2e', borderRadius: 6, padding: 12 }}>
                <div style={{ color: '#888', fontSize: 12, marginBottom: 6 }}>Worked solution</div>
                <div style={{ color: '#ddd', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  <MathText text={q.kind === 'numeric' && instance && !instance.error ? fillTemplate(q.solution, instance.vars, instance.answer) : q.solution} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {!revealed && q.kind === 'recall' && (
        <button onClick={revealRecall} style={{ ...btn, marginTop: 22, background: '#0070f3', color: '#fff', padding: '14px 48px', fontSize: 16 }}>
          Show answer <span style={{ opacity: 0.6, fontSize: 12 }}>(Space)</span>
        </button>
      )}
      {!revealed && q.kind === 'explain' && (
        <button onClick={compareExplain} style={{ ...btn, marginTop: 22, background: '#0070f3', color: '#fff', padding: '14px 48px', fontSize: 16 }}>
          Compare with model answer
        </button>
      )}
    </div>
  );
}