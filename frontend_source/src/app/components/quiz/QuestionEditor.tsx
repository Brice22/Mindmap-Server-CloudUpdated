'use client';

// ============================================================
// 🧪 QUESTION EDITOR - write a question in any of the 4 formats
// ============================================================
//   🃏 Recall          question → answer, grade yourself
//   🔢 Numeric         a template with {variables} + a formula; new numbers
//                      every time, checked automatically (tolerance %)
//   ✍️ Explain/derive  write it out, then compare with your model answer
//                      and tick the checklist
//   🔘 Multiple choice choices you write; each wrong one can say which
//                      misconception it catches
// Plus the LLE cell it tests (level × representation) and an optional
// worked solution shown after answering. Use $…$ for math anywhere.
// Cards written in a Doc: only the format/LLE tag can change here.
// ============================================================

import React, { useMemo, useState } from 'react';
import type { Node } from '@/lib/types';
import MathText from '@/lib/MathText';
import { LLE_LEVELS, LLE_REPS, KIND_INFO } from '@/lib/lle';
import { makeInstance, fillTemplate, formatNumber, type QuizVariable } from '@/lib/quizMath';

export interface QuizQuestion {
  id: string;
  kind: 'recall' | 'numeric' | 'explain' | 'choice';
  question: string;
  answer: string;
  lleLevel: number | null;
  lleRep: string | null;
  spec: any;
  solution: string | null;
  nodeId: number | null;
   nodeName: string;
  difficulty: 'easy' | 'medium' | 'hard';
  documentId: number | null;
  genKey?: string | null;          // ✨ made from your map (text follows the map)
}

interface Props {
  apiUrl: string;
  nodes: Node[];
  existing?: QuizQuestion | null;          // editing
  preset?: { nodeId?: number | null; lleLevel?: number | null; lleRep?: string | null };
  onClose: () => void;
  onSaved: () => void;
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 };
const box: React.CSSProperties = { background: '#2a2a3a', padding: 22, borderRadius: 8, width: 640, maxWidth: '94vw', maxHeight: '88vh', overflow: 'auto', border: '1px solid #444', color: '#ccc', fontSize: 13 };
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: 8, borderRadius: 4, fontSize: 13 };
const small: React.CSSProperties = { ...field, width: 'auto', padding: '5px 6px' };
const label: React.CSSProperties = { display: 'block', color: '#999', fontSize: 12, margin: '12px 0 4px' };
const btn: React.CSSProperties = { border: 'none', padding: '7px 14px', borderRadius: 5, cursor: 'pointer', fontSize: 13 };

const emptyVar = (): QuizVariable => ({ name: '', min: 1, max: 10, step: 1, unit: '' });

export default function QuestionEditor({ apiUrl, nodes, existing, preset, onClose, onSaved }: Props) {
  const fromGen = !!existing?.genKey;                           // ✨ made from your map: only LLE cell + difficulty change
  const fromDoc = existing?.documentId != null || fromGen;      // text can't be edited here
  const spec0 = existing?.spec || {};
  const [kind, setKind] = useState<QuizQuestion['kind']>(existing?.kind || 'recall');
  const [question, setQuestion] = useState(existing?.question || '');
  const [answer, setAnswer] = useState(existing?.kind === 'numeric' ? '' : existing?.answer || '');
  const [lleLevel, setLleLevel] = useState<number | null>(existing?.lleLevel ?? preset?.lleLevel ?? null);
  const [lleRep, setLleRep] = useState<string | null>(existing?.lleRep ?? preset?.lleRep ?? null);
  const [solution, setSolution] = useState(existing?.solution || '');
  const [difficulty, setDifficulty] = useState<QuizQuestion['difficulty']>(existing?.difficulty || 'medium');
  const [nodeId, setNodeId] = useState<number | null>(existing?.nodeId ?? preset?.nodeId ?? null);
  const [nodeSearch, setNodeSearch] = useState(() => nodes.find(n => n.id === (existing?.nodeId ?? preset?.nodeId))?.name || '');
  // numeric
  const [variables, setVariables] = useState<QuizVariable[]>(spec0.variables?.length ? spec0.variables : [emptyVar()]);
  const [formula, setFormula] = useState<string>(spec0.formula || '');
  const [tolerance, setTolerance] = useState<number>(spec0.tolerancePct ?? 1);
  const [unit, setUnit] = useState<string>(spec0.unit || '');
  // choice
  const [choices, setChoices] = useState<{ text: string; correct: boolean; why?: string }[]>(
    spec0.choices?.length ? spec0.choices : [{ text: '', correct: true }, { text: '', correct: false, why: '' }, { text: '', correct: false, why: '' }]);
  // explain
  const [checklist, setChecklist] = useState<string>((spec0.checklist || []).join('\n'));

  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewSeed, setPreviewSeed] = useState(0);

  // Numeric preview: one set of numbers and the answer
  const preview = useMemo(() => {
    if (kind !== 'numeric') return null;
    try {
      const { vars, answer: a } = makeInstance({ variables: variables.filter(v => v.name), formula });
      return { text: fillTemplate(question, vars), answer: a, sol: solution ? fillTemplate(solution, vars, a) : '' };
    } catch (e: any) {
      return { error: e.message };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, variables, formula, question, solution, previewSeed]);

  const nodeChoices = nodeSearch && nodeId == null
    ? nodes.filter(n => n.name.toLowerCase().includes(nodeSearch.toLowerCase())).slice(0, 12) : [];

  const setVar = (i: number, patch: Partial<QuizVariable>) => setVariables(vs => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));

  const save = async () => {
    setError('');
    let spec: any = {};
    let ans = answer.trim();
    if (kind === 'numeric') {
      if (!formula.trim()) return setError('Write the formula for the answer');
      if (preview && 'error' in preview) return setError(`The formula or variables don't work yet: ${preview.error}`);
      const vs = variables.filter(v => v.name.trim()).map(v => ({ ...v, name: v.name.trim() }));
      spec = { variables: vs, formula: formula.trim(), tolerancePct: tolerance || 1, unit: unit.trim() };
      ans = `= ${formula.trim()}${unit.trim() ? ` ${unit.trim()}` : ''}`;
    } else if (kind === 'choice') {
      const cs = choices.filter(c => c.text.trim());
      if (cs.length < 2) return setError('Give at least two choices');
      if (!cs.some(c => c.correct)) return setError('Mark the correct choice');
      spec = { choices: cs };
      ans = cs.filter(c => c.correct).map(c => c.text).join(' / ');
    } else if (kind === 'explain') {
      spec = { checklist: checklist.split('\n').map(s => s.trim()).filter(Boolean) };
    }
    if (!fromDoc && !question.trim()) return setError('Write the question');
    if (!fromDoc && !ans) return setError('Write the answer');
    const node = nodeId != null ? nodes.find(n => n.id === nodeId) : null;
    const body: any = fromGen ? { lleLevel, lleRep, difficulty } : { kind, lleLevel, lleRep, spec, solution: solution.trim() || null, difficulty };
    if (!fromDoc) Object.assign(body, { question: question.trim(), answer: ans, nodeId: node?.id ?? null, nodeName: node?.name || null });
    setSaving(true);
    try {
      const r = await fetch(`${apiUrl}/api/mindmap/quiz/questions${existing ? `/${existing.id}` : ''}`, {
        method: existing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.message || `Failed (${r.status})`);
      onSaved(); onClose();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
       <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box}>
        <h3 style={{ color: '#fff', margin: '0 0 10px' }}>{existing ? 'Edit question' : 'New question'}</h3>
        {fromGen ? <div style={{ color: '#f59e0b', marginBottom: 8 }}>✨ Made from your map — it changes when the links, sub-nodes or description change. Here you can set its LLE cell.</div>
          : fromDoc && <div style={{ color: '#f59e0b', marginBottom: 8 }}>Written in a Doc — change its text there. Here you can set its format and LLE cell.</div>}

        {/* Format */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['recall', 'numeric', 'explain', 'choice'] as const).map(k => (
            <button key={k} onClick={() => setKind(k)} disabled={fromGen && kind !== k} style={{ ...btn, background: kind === k ? '#0070f3' : '#333', color: '#fff', opacity: fromGen && kind !== k ? 0.4 : 1 }}>
              {KIND_INFO[k].icon} {KIND_INFO[k].name}
            </button>
          ))}
        </div>

        {/* LLE cell */}
        <span style={label}>LLE cell it tests (optional, but it fills your chart)</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <select style={small} value={lleLevel ?? ''} onChange={e => setLleLevel(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Level…</option>
            {LLE_LEVELS.map(l => <option key={l.level} value={l.level}>L{l.level} {l.name} — {l.hint}</option>)}
          </select>
          <select style={small} value={lleRep ?? ''} onChange={e => setLleRep(e.target.value || null)}>
            <option value="">Representation…</option>
            {LLE_REPS.map(r => <option key={r.rep} value={r.rep}>{r.name} — {r.hint}</option>)}
          </select>
        </div>

        {/* Question */}
        <span style={label}>{kind === 'numeric' ? 'Question template — put variables in braces, e.g. A {m} kg cart accelerates at {a} m/s²…' : 'Question'}</span>
        <textarea style={field} rows={3} value={question} disabled={fromDoc} onChange={e => setQuestion(e.target.value)}
          placeholder={kind === 'explain' ? 'Derive… / Why does… / Explain how…' : 'Use $…$ for math'} />

        {/* Per format */}
        {kind === 'recall' && (
          <>
            <span style={label}>Answer</span>
            <textarea style={field} rows={3} value={answer} disabled={fromDoc} onChange={e => setAnswer(e.target.value)} />
          </>
        )}

        {kind === 'explain' && (
          <>
            <span style={label}>Model answer (what a complete explanation/derivation says)</span>
            <textarea style={field} rows={5} value={answer} disabled={fromDoc} onChange={e => setAnswer(e.target.value)} />
            <span style={label}>Checklist — one point per line (you tick what your answer covered)</span>
            <textarea style={field} rows={4} value={checklist} onChange={e => setChecklist(e.target.value)}
              placeholder={'States the definition\nShows each algebra step\nNames where the assumption breaks'} />
          </>
        )}

        {kind === 'choice' && (
          <>
            <span style={label}>Choices — tick the right one; for wrong ones, say which misconception they catch</span>
            {choices.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input type="radio" checked={c.correct} onChange={() => setChoices(cs => cs.map((x, j) => ({ ...x, correct: j === i })))} title="Correct answer" />
                <input style={{ ...field, flex: 2 }} value={c.text} placeholder={`Choice ${i + 1}`} onChange={e => setChoices(cs => cs.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                {!c.correct && <input style={{ ...field, flex: 2 }} value={c.why || ''} placeholder="Misconception (shown if picked)" onChange={e => setChoices(cs => cs.map((x, j) => (j === i ? { ...x, why: e.target.value } : x)))} />}
                <button style={{ ...btn, background: 'none', color: '#777', padding: 4 }} onClick={() => setChoices(cs => cs.filter((_, j) => j !== i))} title="Remove">✕</button>
              </div>
            ))}
            <button style={{ ...btn, background: '#333', color: '#ccc' }} onClick={() => setChoices(cs => [...cs, { text: '', correct: false, why: '' }])}>+ Choice</button>
          </>
        )}

        {kind === 'numeric' && (
          <>
            <span style={label}>Variables — a range (min, max, step or decimals), a list (2, 5, 9), or a formula of earlier variables</span>
            {variables.map((v, i) => (
              <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input style={{ ...small, width: 60 }} value={v.name} placeholder="name" onChange={e => setVar(i, { name: e.target.value.replace(/[^A-Za-z0-9_]/g, '') })} />
                {v.expr !== undefined ? (
                  <input style={{ ...small, flex: 1, minWidth: 160 }} value={v.expr} placeholder="= formula, e.g. m*a" onChange={e => setVar(i, { expr: e.target.value })} />
                ) : v.values !== undefined ? (
                  <input style={{ ...small, flex: 1, minWidth: 160 }} value={v.values.join(', ')} placeholder="values, e.g. 2, 5, 9"
                    onChange={e => setVar(i, { values: e.target.value.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n)) })} />
                ) : (
                  <>
                    <input style={{ ...small, width: 64 }} value={v.min ?? ''} placeholder="min" onChange={e => setVar(i, { min: num(e.target.value) })} />
                    <input style={{ ...small, width: 64 }} value={v.max ?? ''} placeholder="max" onChange={e => setVar(i, { max: num(e.target.value) })} />
                    <input style={{ ...small, width: 56 }} value={v.step ?? ''} placeholder="step" title="Pick multiples of this" onChange={e => setVar(i, { step: num(e.target.value) })} />
                    <input style={{ ...small, width: 56 }} value={v.decimals ?? ''} placeholder="dec." title="Or round to this many decimals" onChange={e => setVar(i, { decimals: num(e.target.value) })} />
                  </>
                )}
                <input style={{ ...small, width: 60 }} value={v.unit || ''} placeholder="unit" onChange={e => setVar(i, { unit: e.target.value })} />
                <select style={small} value={v.expr !== undefined ? 'expr' : v.values !== undefined ? 'list' : 'range'}
                  onChange={e => {
                    const m = e.target.value;
                    setVariables(vs => vs.map((x, j) => (j !== i ? x
                      : m === 'expr' ? { name: x.name, unit: x.unit, expr: '' }
                      : m === 'list' ? { name: x.name, unit: x.unit, values: [] }
                      : { name: x.name, unit: x.unit, min: 1, max: 10, step: 1 })));
                  }}>
                  <option value="range">range</option><option value="list">list</option><option value="expr">formula</option>
                </select>
                <button style={{ ...btn, background: 'none', color: '#777', padding: 4 }} onClick={() => setVariables(vs => vs.filter((_, j) => j !== i))} title="Remove">✕</button>
              </div>
            ))}
            <button style={{ ...btn, background: '#333', color: '#ccc' }} onClick={() => setVariables(vs => [...vs, emptyVar()])}>+ Variable</button>

            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <div style={{ flex: 3, minWidth: 200 }}>
                <span style={label}>Answer formula (e.g. m*a, 0.5*m*v^2, sqrt(2*g*h), sin(rad(theta)))</span>
                <input style={field} value={formula} onChange={e => setFormula(e.target.value)} placeholder="m*a" />
              </div>
              <div style={{ flex: 1, minWidth: 80 }}>
                <span style={label}>Unit</span>
                <input style={field} value={unit} onChange={e => setUnit(e.target.value)} placeholder="N" />
              </div>
              <div style={{ flex: 1, minWidth: 80 }}>
                <span style={label}>Tolerance %</span>
                <input style={field} value={tolerance} onChange={e => setTolerance(Number(e.target.value) || 0)} />
              </div>
            </div>

            {preview && (
              <div style={{ marginTop: 10, background: '#1e1e2e', borderRadius: 6, padding: 10, border: '1px solid #3a3a4e' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#888', fontSize: 12 }}>
                  <span>Preview (one set of numbers)</span>
                  <button style={{ ...btn, padding: '2px 8px', background: '#333', color: '#ccc' }} onClick={() => setPreviewSeed(s => s + 1)}>🎲 New numbers</button>
                </div>
                {'error' in preview
                  ? <div style={{ color: '#f87171', marginTop: 6 }}>{preview.error}</div>
                  : <>
                      <div style={{ color: '#fff', marginTop: 6 }}><MathText text={preview.text} /></div>
                      <div style={{ color: '#4ade80', marginTop: 4 }}>Answer: {formatNumber(preview.answer!)} {unit}</div>
                    </>}
              </div>
            )}
          </>
        )}

        {/* Worked solution */}
        <span style={label}>{kind === 'numeric' ? 'Worked solution (optional) — {m}, {a}… and {answer} are filled in' : 'Worked solution / notes shown after answering (optional)'}</span>
        <textarea style={field} rows={3} value={solution} onChange={e => setSolution(e.target.value)} />

        {/* Node + difficulty */}
        {!fromDoc && (
          <div style={{ display: 'flex', gap: 10, marginTop: 4, flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 220, position: 'relative' }}>
              <span style={label}>Node (its deck)</span>
              <input style={field} value={nodeSearch} placeholder="Search nodes…" onChange={e => { setNodeSearch(e.target.value); setNodeId(null); }} />
              {nodeChoices.length > 0 && (
                <div style={{ position: 'absolute', left: 0, right: 0, zIndex: 2, maxHeight: 160, overflow: 'auto', background: '#1e1e2e', border: '1px solid #444', borderRadius: 4 }}>
                  {nodeChoices.map(n => <div key={n.id} onClick={() => { setNodeId(n.id); setNodeSearch(n.name); }} style={{ padding: '6px 10px', cursor: 'pointer' }}>{n.name}</div>)}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <span style={label}>Difficulty</span>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['easy', 'medium', 'hard'] as const).map(d => (
                  <button key={d} onClick={() => setDifficulty(d)} style={{ ...btn, flex: 1, padding: '7px 4px', color: '#fff', textTransform: 'capitalize',
                    background: difficulty === d ? (d === 'easy' ? '#22c55e' : d === 'hard' ? '#ef4444' : '#f59e0b') : '#333' }}>{d}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {error && <div style={{ color: '#f87171', marginTop: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={onClose} style={{ ...btn, background: '#333', color: '#ccc' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...btn, background: '#0070f3', color: '#fff' }}>{saving ? 'Saving…' : existing ? 'Save' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}