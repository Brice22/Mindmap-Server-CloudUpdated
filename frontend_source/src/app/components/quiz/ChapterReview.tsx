'use client';

// ============================================================
// 🔁 CHAPTER REVIEW - a spaced review of a finished chapter
// ============================================================
// 1. Recall    write everything you remember, without looking (free recall /
//              "blurting" — the act of pulling it out is what makes it stick)
// 2. Check     your summary and your before-reading questions next to what you
//              wrote; add anything you missed to the summary; rate how much
//              you got (1–4). 3–4 moves to the next, longer gap (1, 3, 7, 16,
//              35, 90 days, then 180); 1–2 repeats tomorrow.
// 3. Connect   how it links to earlier chapters and other topics, why it's
//              true, where you'd use it (saved with your synthesis answers)
// 4. Questions quiz the chapter's cards, or open the 🪜 LLE ladder to add more
// ============================================================

import React, { useEffect, useState } from 'react';
import MathText from '@/lib/MathText';
import { unCloze } from '@/lib/lle';

interface Props {
  apiUrl: string;
  reviewId: number;
  chapter: { id: number; name: string };
  today: string;
  cardCount: number;
  preQuestions?: string;          // written before reading (chapter details)
  onClose: () => void;
  onDone: () => void;
  onQuiz: () => void;
  onLadder: () => void;
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9995 };
const box: React.CSSProperties = { background: '#2a2a3a', padding: 22, borderRadius: 8, width: 860, maxWidth: '96vw', maxHeight: '92vh', overflow: 'auto', border: '1px solid #444', color: '#ccc', fontSize: 13 };
const btn: React.CSSProperties = { border: 'none', padding: '8px 14px', borderRadius: 5, cursor: 'pointer', fontSize: 13 };
const field: React.CSSProperties = { background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: 10, fontSize: 13, width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 };
const RATINGS = [
  { r: 1, label: 'Very little', bg: '#ef4444' },
  { r: 2, label: 'Some of it', bg: '#f59e0b' },
  { r: 3, label: 'Most of it', bg: '#22c55e' },
  { r: 4, label: 'Nearly all', bg: '#3b82f6' },
];
const CONNECT_PROMPTS = [
  'How does this connect to earlier chapters, or to other things you know?',
  'Why is the main idea true? (not just what — why)',
  'Where would you use this — at work, in a project, in another subject?',
  'What would you still get wrong, or what is unclear?',
];

export default function ChapterReview({ apiUrl, reviewId, chapter, today, cardCount, preQuestions = '', onClose, onDone, onQuiz, onLadder }: Props) {
  const [step, setStep] = useState(1);
  const [recall, setRecall] = useState('');
  const [missed, setMissed] = useState('');
  const [rating, setRating] = useState<number | null>(null);
  const [connections, setConnections] = useState('');
  const [summary, setSummary] = useState('');
  const [history, setHistory] = useState<any[]>([]);
  const [result, setResult] = useState<{ nextDue: string } | null>(null);
  const [error, setError] = useState('');
  const [started] = useState(Date.now());

  useEffect(() => {
    fetch(`${apiUrl}/api/mindmap/study/summary/${chapter.id}`).then(r => (r.ok ? r.json() : null)).then(d => setSummary(d?.text || '')).catch(() => {});
    fetch(`${apiUrl}/api/mindmap/study/chapters/${chapter.id}/reviews`).then(r => (r.ok ? r.json() : [])).then(setHistory).catch(() => {});
  }, [apiUrl, chapter.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lastRecall = history.find(h => h.done_at && h.recall);
  const reviewNo = history.filter(h => h.done_at).length + 1;

  const finish = async () => {
    if (!rating) return setError('Rate how much you remembered');
    setError('');
    try {
      if (missed.trim()) {
        await fetch(`${apiUrl}/api/mindmap/study/summary/${chapter.id}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: missed }),
        });
      }
      const r = await fetch(`${apiUrl}/api/mindmap/study/reviews/${reviewId}/complete`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating, recall, connections, day: today }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || `Error ${r.status}`);
      setResult(d); setStep(4); onDone();
    } catch (e: any) { setError(e.message); }
  };

  const minutes = Math.max(1, Math.round((Date.now() - started) / 60000));

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box} role="dialog" aria-label="Chapter review">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h3 style={{ color: '#fff', margin: 0 }}>🔁 Review — {chapter.name}</h3>
            <div style={{ color: '#888', fontSize: 12, marginTop: 3 }}>Review #{reviewNo} · step {step} of 4</div>
          </div>
          <button onClick={onClose} style={{ ...btn, background: 'none', color: '#888', fontSize: 15 }}>✕</button>
        </div>
        <div style={{ display: 'flex', gap: 4, margin: '12px 0 16px' }}>
          {['Recall', 'Check', 'Connect', 'Questions'].map((s, i) => (
            <div key={s} style={{ flex: 1, textAlign: 'center', fontSize: 11, padding: '4px 0', borderRadius: 4,
              background: step === i + 1 ? '#7c3aed' : step > i + 1 ? '#3b2f5c' : '#1e1e2e', color: step >= i + 1 ? '#fff' : '#666' }}>{i + 1}. {s}</div>
          ))}
        </div>

        {step === 1 && (
          <>
            <div style={{ color: '#fff', fontSize: 15, marginBottom: 6 }}>Write everything you remember from this chapter — without looking.</div>
            <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>Main ideas, definitions, formulas, examples, how things connect. Messy is fine; pulling it out of memory is the point.</div>
            <textarea value={recall} onChange={e => setRecall(e.target.value)} rows={12} style={field} autoFocus placeholder="Start writing…" />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button onClick={() => setStep(2)} style={{ ...btn, background: '#7c3aed', color: '#fff' }}>{recall.trim() ? 'Check against my summary →' : 'I remember nothing — show me →'}</button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>What you remembered</div>
                <div style={{ ...field, minHeight: 160, whiteSpace: 'pre-wrap', color: '#ddd' }}>{recall || <span style={{ color: '#666' }}>(nothing written)</span>}</div>
              </div>
              <div>
                <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>Your summary</div>
                <div style={{ ...field, minHeight: 160, maxHeight: 320, overflow: 'auto', color: '#ddd' }}>
                  {summary ? summary.split('\n').map((l, i) => <div key={i}><MathText text={unCloze(l)} /></div>)
                    : <span style={{ color: '#666' }}>No summary yet — check the book itself, and write one in 📝 Summary afterwards.</span>}
                </div>
              </div>
            </div>
            {preQuestions.trim() && (
              <div style={{ marginTop: 10, background: '#1e1e2e', borderRadius: 6, padding: 10 }}>
                <div style={{ color: '#888', fontSize: 11, textTransform: 'uppercase', marginBottom: 4 }}>Your before-reading questions — can you answer them now?</div>
                {preQuestions.split('\n').filter(Boolean).map((l, i) => <div key={i} style={{ color: '#ddd' }}>❓ {l}</div>)}
              </div>
            )}
            {lastRecall && (
              <details style={{ marginTop: 8, color: '#888' }}>
                <summary style={{ cursor: 'pointer' }}>What you remembered last time ({String(lastRecall.done_at).slice(0, 10)}, rated {lastRecall.rating}/4)</summary>
                <div style={{ whiteSpace: 'pre-wrap', color: '#aaa', marginTop: 4 }}>{lastRecall.recall}</div>
              </details>
            )}
            <div style={{ color: '#aaa', margin: '14px 0 4px' }}>What did you miss? <span style={{ color: '#666', fontSize: 12 }}>(added to your summary — card lines like <code>term :: answer</code> become questions)</span></div>
            <textarea value={missed} onChange={e => setMissed(e.target.value)} rows={3} style={field} placeholder="Things you forgot or got wrong…" />
            <div style={{ color: '#fff', margin: '14px 0 6px' }}>How much did you remember?</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {RATINGS.map(x => (
                <button key={x.r} onClick={() => setRating(x.r)}
                  style={{ ...btn, background: rating === x.r ? x.bg : '#1e1e2e', color: rating === x.r ? '#fff' : '#ccc', border: `1px solid ${x.bg}` }}>{x.r}. {x.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
              <button onClick={() => setStep(1)} style={{ ...btn, background: '#333', color: '#ccc' }}>← Back</button>
              <button onClick={() => (rating ? setStep(3) : setError('Rate how much you remembered'))} style={{ ...btn, background: '#7c3aed', color: '#fff' }}>Connect it →</button>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <div style={{ color: '#fff', fontSize: 15, marginBottom: 6 }}>Connect it</div>
            <div style={{ color: '#aaa', marginBottom: 8, lineHeight: 1.7 }}>{CONNECT_PROMPTS.map((t, i) => <div key={i}>• {t}</div>)}</div>
            <textarea value={connections} onChange={e => setConnections(e.target.value)} rows={8} style={field}
              placeholder="This builds on… It matters because… I'd use it when… I'm still unsure about…" />
            <div style={{ color: '#666', fontSize: 12, marginTop: 6 }}>Saved with your Level-4 synthesis answers (it shows in 📤 Export for AI). To draw a link on the graph: right-click the chapter → 🔗 Link to another node.</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
              <button onClick={() => setStep(2)} style={{ ...btn, background: '#333', color: '#ccc' }}>← Back</button>
              <button onClick={finish} style={{ ...btn, background: '#16a34a', color: '#fff' }}>Finish review ✓</button>
            </div>
          </>
        )}

        {step === 4 && result && (
          <div style={{ textAlign: 'center', padding: '10px 0' }}>
            <div style={{ color: '#86efac', fontSize: 18, fontWeight: 700 }}>✓ Review done ({minutes} min)</div>
            <div style={{ color: '#aaa', marginTop: 6 }}>
              {rating! >= 3 ? 'Next review' : 'Not quite there — again'} on <b style={{ color: '#fff' }}>{result.nextDue}</b>.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
              <button onClick={onQuiz} disabled={!cardCount} style={{ ...btn, background: cardCount ? '#6d28d9' : '#333', color: cardCount ? '#fff' : '#666' }}>🧪 Quiz this chapter ({cardCount})</button>
              <button onClick={onLadder} style={{ ...btn, background: '#333', color: '#ddd' }}>🪜 Add questions with the LLE ladder</button>
              <button onClick={onClose} style={{ ...btn, background: '#333', color: '#ccc' }}>Close</button>
            </div>
          </div>
        )}
        {error && <div style={{ color: '#f87171', marginTop: 10 }}>{error}</div>}
      </div>
    </div>
  );
}