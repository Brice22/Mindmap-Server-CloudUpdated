'use client';

// ============================================================
// 🏷 ROLE & TAGS - right-click a node → "🏷 Role & tags…"
// ============================================================
// Role: what the node is for (📚 Knowledge is quizzed in the daily review,
// 🗂 Lesson plan holds 📄 Lessons, 📖 Book holds 📑 Chapters…).
// Tags: your coloured topics (Bioengineering, CNC, Finance…) — filter the
// graph by them and study them as a deck in the Quiz Center.
// Lessons get objectives, LLE targets (which cells the lesson should reach),
// a status and an order inside their plan.
// Saved into the node's metadata (role, tags, lesson / plan / book / chapter).
// ============================================================

import React, { useEffect, useState } from 'react';
import type { Node } from '@/lib/types';
import { ROLES, LESSON_STATUS, nextTagColor, metaOf, tagsOf, type Tag, type LessonMeta } from '@/lib/labels';
import { LLE_LEVELS, LLE_REPS, cellLabel } from '@/lib/lle';

interface Props {
  apiUrl: string;
  node: Node;
  tags: Tag[];
  onTagsChanged: () => void;                      // reload the tag list (colours)
  onSave: (metadataPatch: Record<string, any>) => Promise<void> | void;
  onClose: () => void;
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 };
const box: React.CSSProperties = { background: '#2a2a3a', padding: 20, borderRadius: 8, width: 560, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid #444', color: '#ccc', fontSize: 13 };
const btn: React.CSSProperties = { border: 'none', padding: '7px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 13 };
const field: React.CSSProperties = { background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '5px 7px', fontSize: 13 };
const h: React.CSSProperties = { color: '#aaa', fontSize: 12, textTransform: 'uppercase', margin: '16px 0 8px' };

export default function LabelsDialog({ apiUrl, node, tags, onTagsChanged, onSave, onClose }: Props) {
  const meta = metaOf(node);
  const [role, setRole] = useState<string>(meta.role || '');
  const [nodeTags, setNodeTags] = useState<string[]>(tagsOf(node));
  const [lesson, setLesson] = useState<LessonMeta>(meta.lesson || {});
  const [objectivesText, setObjectivesText] = useState<string>((meta.lesson?.objectives || []).join('\n'));
  const [plan, setPlan] = useState<{ audience?: string; description?: string }>(meta.plan || {});
  const [book, setBook] = useState<{ author?: string }>(meta.book || {});
  const [chapter, setChapter] = useState<{ number?: number | '' }>(meta.chapter || {});
  const [newTag, setNewTag] = useState('');
  const [newColor, setNewColor] = useState(() => nextTagColor(tags));
  const [manage, setManage] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [target, setTarget] = useState<{ level: number; rep: string }>({ level: 1, rep: '' });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const colorOf = (name: string) => tags.find(t => t.name === name)?.color || '#888';
  const toggleTag = (name: string) => setNodeTags(prev => (prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]));

  const call = async (url: string, method: string, body?: any) => {
    const res = await fetch(`${apiUrl}${url}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.message || `Error ${res.status}`);
    return data;
  };

  const createTag = async () => {
    const name = newTag.trim();
    if (!name) return;
    setError('');
    try {
      const created = tags.some(t => t.name.toLowerCase() === name.toLowerCase()) ? null : await call('/api/mindmap/tags', 'POST', { name, color: newColor });
      const existing = tags.find(t => t.name.toLowerCase() === name.toLowerCase());
      const finalName = existing?.name || name;
      setNodeTags(prev => (prev.includes(finalName) ? prev : [...prev, finalName]));
      setNewTag('');
      setNewColor(nextTagColor(created ? [...tags, created] : tags));
      onTagsChanged();
    } catch (e: any) { setError(e.message); }
  };

  const editTag = async (t: Tag, changes: { name?: string; color?: string }) => {
    setError('');
    try {
      await call(`/api/mindmap/tags/${t.id}`, 'PUT', changes);
      if (changes.name) setNodeTags(prev => prev.map(x => (x === t.name ? changes.name! : x)));
      onTagsChanged();
    } catch (e: any) { setError(e.message); }
  };

  const deleteTag = async (t: Tag) => {
    if (!confirm(`Delete the tag "${t.name}"? It comes off ${t.nodes ?? 'all'} node(s); the nodes stay.`)) return;
    try {
      await call(`/api/mindmap/tags/${t.id}`, 'DELETE');
      setNodeTags(prev => prev.filter(x => x !== t.name));
      onTagsChanged();
    } catch (e: any) { setError(e.message); }
  };

  const save = async () => {
    setSaving(true);
    const patch: Record<string, any> = { role: role || null, tags: nodeTags };
    if (role === 'lesson') {
      patch.lesson = {
        ...lesson,
        objectives: objectivesText.split('\n').map(s => s.trim()).filter(Boolean),
        status: lesson.status || 'draft',
        audience: lesson.audience || 'study',
      };
    }
    if (role === 'lessonPlan') patch.plan = { audience: plan.audience || 'study', description: plan.description || '' };
    if (role === 'book') patch.book = { author: book.author || '' };
    if (role === 'chapter') patch.chapter = { number: chapter.number === '' || chapter.number == null ? null : Number(chapter.number) };
    try { await onSave(patch); onClose(); } catch (e: any) { setError(e?.message || 'Could not save'); }
    setSaving(false);
  };

  const targets = lesson.lleTargets || [];
  const addTarget = () => {
    const t = { level: target.level, rep: target.rep || null };
    if (targets.some(x => x.level === t.level && (x.rep || null) === t.rep)) return;
    setLesson({ ...lesson, lleTargets: [...targets, t].sort((a, b) => a.level - b.level) });
  };

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box} role="dialog" aria-label="Role and tags">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ color: '#fff', margin: 0 }}>🏷 Role &amp; tags — {node.name}</h3>
          <button onClick={onClose} style={{ ...btn, background: 'none', color: '#888' }}>✕</button>
        </div>

        {/* ROLE */}
        <div style={h}>Role</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button onClick={() => setRole('')} style={{ ...btn, background: !role ? '#0070f3' : '#333', color: '#fff' }}>None</button>
          {ROLES.map(r => (
            <button key={r.key} onClick={() => setRole(r.key)} title={r.hint}
              style={{ ...btn, background: role === r.key ? '#0070f3' : '#333', color: '#fff' }}>{r.icon} {r.name}</button>
          ))}
        </div>
        {role && <div style={{ color: '#888', fontSize: 12, marginTop: 6 }}>{ROLES.find(r => r.key === role)?.hint}</div>}

        {/* TAGS */}
        <div style={h}>Tags</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {tags.length === 0 && <span style={{ color: '#777', fontSize: 12 }}>No tags yet — make one below.</span>}
          {tags.map(t => {
            const on = nodeTags.includes(t.name);
            return (
              <button key={t.id} onClick={() => toggleTag(t.name)} title={on ? 'Click to remove' : 'Click to add'}
                style={{ ...btn, padding: '4px 10px', borderRadius: 14, background: on ? t.color : 'transparent', color: on ? '#111' : t.color,
                  border: `1px solid ${t.color}`, fontWeight: on ? 600 : 400 }}>
                {on ? '✓ ' : ''}{t.name}
              </button>
            );
          })}
          {/* tags on the node that aren't in the list (e.g. deleted elsewhere) */}
          {nodeTags.filter(n => !tags.some(t => t.name === n)).map(n => (
            <button key={n} onClick={() => toggleTag(n)} style={{ ...btn, padding: '4px 10px', borderRadius: 14, background: '#555', color: '#fff' }}>✓ {n}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createTag(); }}
            placeholder="New tag (e.g. CNC)" maxLength={40} style={{ ...field, flex: 1 }} />
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} title="Tag colour"
            style={{ width: 34, height: 30, padding: 0, border: 'none', background: 'none' }} />
          <button onClick={createTag} disabled={!newTag.trim()} style={{ ...btn, background: '#333', color: '#ddd' }}>+ Add</button>
          {tags.length > 0 && <button onClick={() => setManage(m => !m)} style={{ ...btn, background: 'none', color: '#888' }}>{manage ? 'Done' : 'Manage…'}</button>}
        </div>
        {manage && (
          <div style={{ marginTop: 8, background: '#1e1e2e', borderRadius: 6, padding: 8 }}>
            {tags.map(t => (
              <div key={t.id} style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '3px 0' }}>
                <input type="color" defaultValue={t.color} onBlur={e => { if (e.target.value !== t.color) editTag(t, { color: e.target.value }); }}
                  style={{ width: 28, height: 24, padding: 0, border: 'none', background: 'none' }} />
                <input defaultValue={t.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.name) editTag(t, { name: v }); }}
                  style={{ ...field, flex: 1, padding: '3px 6px' }} />
                <span style={{ color: '#777', fontSize: 11, width: 60 }}>{t.nodes ?? 0} node{t.nodes === 1 ? '' : 's'}</span>
                <button onClick={() => deleteTag(t)} title="Delete tag" style={{ ...btn, padding: '2px 8px', background: 'none', color: '#ef4444' }}>✕</button>
              </div>
            ))}
            <div style={{ color: '#666', fontSize: 11, marginTop: 4 }}>Renaming changes it on every node. Deleting takes it off every node.</div>
          </div>
        )}

        {/* ROLE DETAILS */}
        {role === 'lesson' && (
          <>
            <div style={h}>Lesson</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 10px', alignItems: 'center' }}>
              <span>Status</span>
              <select value={lesson.status || 'draft'} onChange={e => setLesson({ ...lesson, status: e.target.value })} style={field}>
                {LESSON_STATUS.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
              </select>
              <span>For</span>
              <select value={lesson.audience || 'study'} onChange={e => setLesson({ ...lesson, audience: e.target.value as any })} style={field}>
                <option value="study">My own study</option>
                <option value="teaching">Teaching / a video</option>
              </select>
              <span>Order</span>
              <input type="number" min={1} value={lesson.order ?? ''} placeholder="1, 2, 3… (in its plan)"
                onChange={e => setLesson({ ...lesson, order: e.target.value === '' ? undefined : Number(e.target.value) })} style={{ ...field, width: 120 }} />
            </div>
            <div style={{ marginTop: 10 }}>Objectives <span style={{ color: '#777', fontSize: 11 }}>(one per line — "By the end I can…")</span></div>
            <textarea value={objectivesText} onChange={e => setObjectivesText(e.target.value)} rows={4}
              placeholder={'Explain what feed rate and spindle speed control\nWork out RPM from surface speed and tool diameter'}
              style={{ ...field, width: '100%', boxSizing: 'border-box', marginTop: 4, fontFamily: 'inherit' }} />
            <div style={{ marginTop: 10 }}>LLE targets <span style={{ color: '#777', fontSize: 11 }}>(cells this lesson should reach — the plan shows which have questions)</span></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
              {targets.map((t, i) => (
                <span key={i} style={{ background: '#3b2f5c', color: '#d8ccff', borderRadius: 12, padding: '3px 8px', fontSize: 12 }}>
                  {cellLabel(t.level, t.rep)}
                  <span onClick={() => setLesson({ ...lesson, lleTargets: targets.filter((_, j) => j !== i) })} style={{ cursor: 'pointer', marginLeft: 6, color: '#999' }}>✕</span>
                </span>
              ))}
              {!targets.length && <span style={{ color: '#666', fontSize: 12 }}>None yet.</span>}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <select value={target.level} onChange={e => setTarget({ ...target, level: Number(e.target.value) })} style={field}>
                {LLE_LEVELS.map(l => <option key={l.level} value={l.level}>L{l.level} {l.name}</option>)}
              </select>
              <select value={target.rep} onChange={e => setTarget({ ...target, rep: e.target.value })} style={field}>
                <option value="">any representation</option>
                {LLE_REPS.map(r => <option key={r.rep} value={r.rep}>{r.name}</option>)}
              </select>
              <button onClick={addTarget} style={{ ...btn, background: '#333', color: '#ddd' }}>+ Target</button>
            </div>
          </>
        )}
        {role === 'lessonPlan' && (
          <>
            <div style={h}>Lesson plan</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '8px 10px', alignItems: 'center' }}>
              <span>For</span>
              <select value={plan.audience || 'study'} onChange={e => setPlan({ ...plan, audience: e.target.value })} style={field}>
                <option value="study">My own study</option>
                <option value="teaching">Teaching / videos</option>
              </select>
              <span>About</span>
              <input value={plan.description || ''} onChange={e => setPlan({ ...plan, description: e.target.value })} placeholder="What this plan gets you to" style={field} />
            </div>
            <div style={{ color: '#777', fontSize: 12, marginTop: 6 }}>Its lessons are its sub-nodes with the 📄 Lesson role. Right-click it → 🗂 Open lesson plan.</div>
          </>
        )}
        {role === 'book' && (
          <>
            <div style={h}>Book</div>
            <input value={book.author || ''} onChange={e => setBook({ author: e.target.value })} placeholder="Author" style={{ ...field, width: '100%', boxSizing: 'border-box' }} />
            <div style={{ color: '#777', fontSize: 12, marginTop: 6 }}>Chapters are its sub-nodes with the 📑 Chapter role.</div>
          </>
        )}
        {role === 'chapter' && (
          <>
            <div style={h}>Chapter</div>
            <input type="number" min={0} value={chapter.number ?? ''} onChange={e => setChapter({ number: e.target.value === '' ? '' : Number(e.target.value) })}
              placeholder="Chapter number" style={{ ...field, width: 160 }} />
          </>
        )}

        {error && <div style={{ color: '#f87171', marginTop: 12 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button onClick={onClose} style={{ ...btn, background: '#333', color: '#ccc' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{ ...btn, background: '#0070f3', color: '#fff' }}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}