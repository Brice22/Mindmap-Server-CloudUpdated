'use client';

// ============================================================
// 🗂 LESSON PLAN - right-click a Lesson-plan node → "🗂 Open lesson plan"
// ============================================================
// Its lessons are its sub-nodes with the 📄 Lesson role, in order.
// For each lesson: status, objectives, and its LLE targets — green when
// at least one question (in the lesson or its sub-nodes) sits in that
// cell, grey when you still need to write one.
//   ＋ Add lesson   makes a new sub-node with the Lesson role (next in order)
//   ↑ ↓             change the order
//   🧪 Quiz         opens that lesson's deck in the Quiz Center
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Node } from '@/lib/types';
import { LESSON_STATUS, metaOf, lessonsOf, withDescendants, childrenMap } from '@/lib/labels';
import { cellLabel } from '@/lib/lle';

interface Props {
  apiUrl: string;
  plan: Node;
  nodes: Node[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;                              // reload nodes
  onUpdateNode: (id: number, updates: any) => Promise<void>;
  onEditLesson: (lesson: Node) => void;                                // 🏷 dialog for the lesson
  onQuiz: (nodeId: number) => void;                                    // its deck in the Quiz Center
  onShowNode: (node: Node) => void;
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9998 };
const box: React.CSSProperties = { background: '#2a2a3a', padding: 20, borderRadius: 8, width: 760, maxWidth: '96vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', border: '1px solid #444', color: '#ccc', fontSize: 13 };
const btn: React.CSSProperties = { border: 'none', padding: '6px 11px', borderRadius: 5, cursor: 'pointer', fontSize: 12 };
const field: React.CSSProperties = { background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '4px 6px', fontSize: 12 };

export default function LessonPlanPanel({ apiUrl, plan, nodes, onClose, onChanged, onUpdateNode, onEditLesson, onQuiz, onShowNode }: Props) {
  const [cards, setCards] = useState<{ nodeId: number | null; level: number | null; rep: string | null }[]>([]);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const planMeta = metaOf(plan).plan || {};

  const loadCards = useCallback(() => {
    fetch(`${apiUrl}/api/mindmap/flashcards`).then(r => (r.ok ? r.json() : [])).then((rows: any[]) =>
      setCards(rows.map(c => ({ nodeId: c.node_id ?? null, level: c.lle_level ?? null, rep: c.lle_rep ?? null })))).catch(() => {});
  }, [apiUrl]);
  useEffect(() => { loadCards(); }, [loadCards]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const lessons = useMemo(() => lessonsOf(plan, nodes), [plan, nodes]);
  const children = useMemo(() => childrenMap(nodes), [nodes]);

  // Questions in a lesson (and its sub-nodes), and which of its targets have one
  const coverage = useCallback((lesson: Node) => {
    const ids = withDescendants(nodes, [lesson.id], children);
    const mine = cards.filter(c => c.nodeId != null && ids.has(c.nodeId));
    const targets = (metaOf(lesson).lesson?.lleTargets || []) as { level: number; rep?: string | null }[];
    return {
      questions: mine.length,
      targets: targets.map(t => ({ ...t, n: mine.filter(c => c.level === t.level && (!t.rep || c.rep === t.rep)).length })),
    };
  }, [nodes, children, cards]);

  const setLesson = (lesson: Node, changes: Record<string, any>) =>
    onUpdateNode(lesson.id, { metadata: { lesson: { ...(metaOf(lesson).lesson || {}), ...changes } } });

  // Swap with the neighbour; first gives every lesson a clean 1, 2, 3… order
  const move = async (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= lessons.length) return;
    setBusy(true);
    const order = lessons.map((_, k) => k + 1);
    [order[i], order[j]] = [order[j], order[i]];
    for (let k = 0; k < lessons.length; k++) {
      if (Number(metaOf(lessons[k]).lesson?.order) !== order[k]) {
        await fetch(`${apiUrl}/api/mindmap/node/${lessons[k].id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ metadata: { lesson: { ...(metaOf(lessons[k]).lesson || {}), order: order[k] } } }),
        }).catch(() => {});
      }
    }
    await onChanged();
    setBusy(false);
  };

  const addLesson = async () => {
    const name = newName.trim();
    if (!name) return;
    if (nodes.some(n => n.name.toLowerCase() === name.toLowerCase())) { alert('A node with that name already exists — pick another name.'); return; }
    setBusy(true);
    const order = lessons.reduce((m, l) => Math.max(m, Number(metaOf(l).lesson?.order) || 0), lessons.length) + 1;
    try {
      await fetch(`${apiUrl}/api/mindmap/node`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, description: '', type: 'concept',
          metadata: { type: 'concept', parent: plan.name, role: 'lesson', lesson: { order, status: 'draft', audience: planMeta.audience || 'study', objectives: [], lleTargets: [] } },
        }),
      });
      setNewName('');
      await onChanged();
    } catch {}
    setBusy(false);
  };

  const done = lessons.filter(l => ['studied', 'taught'].includes(metaOf(l).lesson?.status)).length;

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box} role="dialog" aria-label="Lesson plan">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <h3 style={{ color: '#fff', margin: 0 }}>🗂 {plan.name}</h3>
            <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>
              {planMeta.audience === 'teaching' ? 'For teaching' : 'For my own study'}
              {planMeta.description ? ` · ${planMeta.description}` : ''}
              {' · '}{lessons.length} lesson{lessons.length === 1 ? '' : 's'}, {done} done
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => onQuiz(plan.id)} disabled={!lessons.length} style={{ ...btn, background: '#6d28d9', color: '#fff' }}>🧪 Quiz whole plan</button>
            <button onClick={() => { loadCards(); onChanged(); }} title="Reload" style={{ ...btn, background: '#333', color: '#ccc' }}>↻</button>
            <button onClick={onClose} style={{ ...btn, background: 'none', color: '#888', fontSize: 14 }}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflow: 'auto', marginTop: 14 }}>
          {lessons.length === 0 && (
            <div style={{ color: '#777', padding: 24, textAlign: 'center', lineHeight: 1.6 }}>
              No lessons yet. Add one below — or give any sub-node of <b>{plan.name}</b> the 📄 Lesson role (right-click → 🏷 Role &amp; tags…).
            </div>
          )}
          {lessons.map((lesson, i) => {
            const lm = metaOf(lesson).lesson || {};
            const cov = coverage(lesson);
            const status = LESSON_STATUS.find(s => s.key === (lm.status || 'draft')) || LESSON_STATUS[0];
            const covered = cov.targets.filter(t => t.n > 0).length;
            return (
              <div key={lesson.id} style={{ background: '#1e1e2e', borderRadius: 6, padding: 12, marginBottom: 8, borderLeft: `4px solid ${status.color}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#666', width: 22, textAlign: 'right' }}>{i + 1}.</span>
                  <span onClick={() => onShowNode(lesson)} title="Show on the graph" style={{ color: '#fff', fontWeight: 600, flex: 1, cursor: 'pointer' }}>📄 {lesson.name}</span>
                  <select value={lm.status || 'draft'} onChange={e => setLesson(lesson, { status: e.target.value })} style={{ ...field, color: status.color }}>
                    {LESSON_STATUS.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
                  </select>
                  <button onClick={() => move(i, -1)} disabled={busy || i === 0} title="Earlier" style={{ ...btn, background: '#333', color: '#ccc', padding: '4px 8px' }}>↑</button>
                  <button onClick={() => move(i, 1)} disabled={busy || i === lessons.length - 1} title="Later" style={{ ...btn, background: '#333', color: '#ccc', padding: '4px 8px' }}>↓</button>
                  <button onClick={() => onEditLesson(lesson)} title="Objectives, LLE targets, tags" style={{ ...btn, background: '#333', color: '#ccc' }}>✎ Edit</button>
                  <button onClick={() => onQuiz(lesson.id)} disabled={!cov.questions} title={cov.questions ? 'Quiz this lesson' : 'No questions yet'}
                    style={{ ...btn, background: cov.questions ? '#6d28d9' : '#333', color: cov.questions ? '#fff' : '#666' }}>🧪 Quiz ({cov.questions})</button>
                </div>
                {(lm.objectives || []).length > 0 && (
                  <ul style={{ margin: '8px 0 0 30px', padding: 0, color: '#bbb' }}>
                    {(lm.objectives as string[]).map((o, k) => <li key={k} style={{ marginBottom: 2 }}>{o}</li>)}
                  </ul>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '8px 0 0 30px', alignItems: 'center' }}>
                  {cov.targets.length > 0 ? (
                    <>
                      <span style={{ color: '#888', fontSize: 11 }}>LLE targets {covered}/{cov.targets.length}:</span>
                      {cov.targets.map((t, k) => (
                        <span key={k} title={t.n ? `${t.n} question(s) in this cell` : 'No question in this cell yet'}
                          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: t.n ? '#14532d' : '#333', color: t.n ? '#86efac' : '#888' }}>
                          {t.n ? '✓' : '○'} {cellLabel(t.level, t.rep)}
                        </span>
                      ))}
                    </>
                  ) : (
                    <span style={{ color: '#666', fontSize: 11 }}>No objectives or LLE targets yet — ✎ Edit to add them.</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addLesson(); }}
            placeholder="New lesson name (e.g. Speeds and feeds)" style={{ ...field, flex: 1, padding: '7px 9px', fontSize: 13 }} />
          <button onClick={addLesson} disabled={busy || !newName.trim()} style={{ ...btn, background: '#0070f3', color: '#fff', fontSize: 13 }}>＋ Add lesson</button>
        </div>
      </div>
    </div>
  );
}