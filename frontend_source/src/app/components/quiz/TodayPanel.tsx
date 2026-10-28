'use client';

// ============================================================
// ✅ TODAY (Quiz Center tab) - what's due + your daily checklist
// ============================================================
// Due today: the 🗓 daily card review and any 🔁 chapter reviews.
// Checklist: your daily habits (Spaced review, Drawing, Reading,
// Programming, Article reading to start — add, rename, hide or reorder
// them in ⚙). You tick them yourself; minutes are optional. Each shows its
// 🔥 streak (days in a row, today or up to yesterday) and the last 14 days.
// ‹ › moves to other days, so you can tick a day you forgot.
// "Article reading" also shows how many Newsfeed articles you read that day.
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';

interface Item { id: number; name: string; icon: string; sort_order: number; active: boolean; target_minutes: number | null }
interface Check { item_id: number; day: string; minutes: number | null; note: string | null }

interface Props {
  apiUrl: string;
  today: string;                                    // YYYY-MM-DD, local
  daily: { count: number; due: number; fresh: number; extra: number; answered: number; minimum: number; streak: number };
  onStartDaily: () => void;
  onReview: (reviewId: number, chapter: { id: number; name: string }) => void;
  refreshKey: number;
}

const btn: React.CSSProperties = { border: 'none', padding: '6px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 12 };
const tile: React.CSSProperties = { background: '#2a2a3a', padding: 14, borderRadius: 8 };
const field: React.CSSProperties = { background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '5px 7px', fontSize: 12 };

function shift(day: string, n: number) {
  const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const label = (day: string, today: string) =>
  day === today ? 'Today' : day === shift(today, -1) ? 'Yesterday'
  : new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export default function TodayPanel({ apiUrl, today, daily, onStartDaily, onReview, refreshKey }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [checks, setChecks] = useState<Check[]>([]);
  const [articles, setArticles] = useState(0);
  const [reviews, setReviews] = useState<any[]>([]);
  const [day, setDay] = useState(today);
  const [manage, setManage] = useState(false);
  const [newItem, setNewItem] = useState({ name: '', icon: '✅' });
  const [minutesDraft, setMinutesDraft] = useState<Record<number, string>>({});
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [t, r] = await Promise.all([
        fetch(`${apiUrl}/api/mindmap/study/today?to=${today}&from=${shift(today, -400)}`).then(x => x.json()),
        fetch(`${apiUrl}/api/mindmap/study/reviews/due?day=${today}`).then(x => (x.ok ? x.json() : [])),
      ]);
      setItems(t.items || []); setChecks(t.checks || []); setArticles(t.articlesReadToday || 0); setReviews(Array.isArray(r) ? r : []);
    } catch (e: any) { setError('Could not load Today'); }
  }, [apiUrl, today]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const checked = useMemo(() => {
    const m = new Map<string, Check>();
    for (const c of checks) m.set(`${c.item_id}:${c.day}`, c);
    return m;
  }, [checks]);
  const isOn = (itemId: number, d: string) => checked.has(`${itemId}:${d}`);

  // Days in a row up to today (or up to yesterday if today isn't ticked yet)
  const streak = (itemId: number) => {
    let d = isOn(itemId, today) ? today : shift(today, -1), n = 0;
    while (isOn(itemId, d)) { n++; d = shift(d, -1); }
    return n;
  };

  const put = async (body: any) => {
    setError('');
    const r = await fetch(`${apiUrl}/api/mindmap/study/today/checks`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) setError('Could not save'); else load();
  };
  const toggle = (it: Item) => {
    const on = isOn(it.id, day);
    // tick at once on screen, save in the background
    setChecks(cs => (on ? cs.filter(c => !(c.item_id === it.id && c.day === day)) : [...cs, { item_id: it.id, day, minutes: null, note: null }]));
    put({ itemId: it.id, day, done: !on, minutes: Number(minutesDraft[it.id]) || null });
  };
  const saveMinutes = (it: Item) => {
    const m = Number(minutesDraft[it.id]);
    if (!(m > 0)) return;
    put({ itemId: it.id, day, done: true, minutes: m, note: checked.get(`${it.id}:${day}`)?.note || null });
    setMinutesDraft(d => ({ ...d, [it.id]: '' }));
  };
  const editItem = async (it: Item, changes: any) => {
    await fetch(`${apiUrl}/api/mindmap/study/today/items/${it.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(changes) });
    load();
  };
  const addItem = async () => {
    if (!newItem.name.trim()) return;
    await fetch(`${apiUrl}/api/mindmap/study/today/items`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newItem) });
    setNewItem({ name: '', icon: '✅' }); load();
  };
  const move = (i: number, dir: -1 | 1) => {
    const list = items.filter(x => x.active);
    const j = i + dir; if (j < 0 || j >= list.length) return;
    editItem(list[i], { sortOrder: list[j].sort_order });
    editItem(list[j], { sortOrder: list[i].sort_order });
  };

  const active = items.filter(i => i.active);
  const doneCount = active.filter(i => isOn(i.id, day)).length;
  const last14 = Array.from({ length: 14 }, (_, i) => shift(today, i - 13));
  const minutesOf = (it: Item) => checked.get(`${it.id}:${day}`)?.minutes;

  return (
    <div>
      {/* DUE TODAY */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div style={{ ...tile, borderLeft: '4px solid #22c55e' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 700 }}>🗓 Daily card review</div>
              <div style={{ color: '#999', fontSize: 12, marginTop: 3 }}>
                {daily.count ? `${daily.count} to do — ${daily.due} due · ${daily.fresh} new${daily.extra ? ` · ${daily.extra} weakest` : ''}` : 'Nothing left for today'}
              </div>
              <div style={{ color: '#777', fontSize: 11, marginTop: 3 }}>{daily.answered} / {daily.minimum} answered · 🔥 {daily.streak}</div>
            </div>
            <button onClick={onStartDaily} disabled={!daily.count} style={{ ...btn, padding: '9px 14px', background: daily.count ? '#22c55e' : '#333', color: daily.count ? '#fff' : '#666' }}>Start</button>
          </div>
        </div>
        <div style={{ ...tile, borderLeft: '4px solid #f59e0b' }}>
          <div style={{ color: '#fff', fontWeight: 700 }}>🔁 Chapter reviews {reviews.length ? <span style={{ color: '#f59e0b' }}>({reviews.length} due)</span> : ''}</div>
          {!reviews.length && <div style={{ color: '#999', fontSize: 12, marginTop: 3 }}>None due. Finish a chapter in 📚 Library to start its reviews.</div>}
          {reviews.slice(0, 6).map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
              <span style={{ flex: 1, color: '#ddd', fontSize: 12 }}>{r.chapter}<span style={{ color: '#777' }}>{r.due < today ? ` · since ${r.due}` : ''}</span></span>
              <button onClick={() => onReview(r.id, { id: r.chapter_id, name: r.chapter })} style={{ ...btn, background: '#f59e0b', color: '#000' }}>Review</button>
            </div>
          ))}
          {reviews.length > 6 && <div style={{ color: '#777', fontSize: 11, marginTop: 4 }}>…and {reviews.length - 6} more</div>}
        </div>
      </div>

      {/* CHECKLIST */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <button onClick={() => setDay(d => shift(d, -1))} aria-label="Previous day" style={{ ...btn, background: '#333', color: '#ccc' }}>‹</button>
        <h3 style={{ color: '#fff', margin: 0, fontSize: 16, minWidth: 150, textAlign: 'center' }}>✅ {label(day, today)}</h3>
        <button onClick={() => setDay(d => shift(d, 1))} disabled={day >= today} aria-label="Next day" style={{ ...btn, background: '#333', color: day >= today ? '#555' : '#ccc' }}>›</button>
        {day !== today && <button onClick={() => setDay(today)} style={{ ...btn, background: 'none', color: '#60a5fa' }}>back to today</button>}
        <span style={{ color: '#888', fontSize: 12 }}>{doneCount} / {active.length} done</span>
        <span style={{ flex: 1 }} />
        <button onClick={() => setManage(m => !m)} style={{ ...btn, background: manage ? '#3b3b55' : '#333', color: '#ccc' }}>⚙ {manage ? 'Done' : 'Edit list'}</button>
      </div>
      {error && <div style={{ color: '#f87171', marginBottom: 8 }}>{error}</div>}

      <div style={{ background: '#2a2a3a', borderRadius: 8, overflow: 'hidden' }}>
        {active.map((it, i) => {
          const on = isOn(it.id, day), s = streak(it.id), mins = minutesOf(it);
          return (
            <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderBottom: '1px solid #33334a', flexWrap: 'wrap' }}>
              <button onClick={() => toggle(it)} aria-label={`${on ? 'Untick' : 'Tick'} ${it.name}`} aria-pressed={on}
                style={{ width: 26, height: 26, borderRadius: 6, border: `2px solid ${on ? '#22c55e' : '#555'}`, background: on ? '#22c55e' : 'transparent', color: '#fff', cursor: 'pointer', fontWeight: 700 }}>
                {on ? '✓' : ''}
              </button>
              {manage ? (
                <>
                  <input defaultValue={it.icon} onBlur={e => e.target.value !== it.icon && editItem(it, { icon: e.target.value })} style={{ ...field, width: 40, textAlign: 'center' }} aria-label="Icon" />
                  <input defaultValue={it.name} onBlur={e => e.target.value.trim() && e.target.value !== it.name && editItem(it, { name: e.target.value })} style={{ ...field, flex: 1 }} aria-label="Name" />
                  <button onClick={() => move(i, -1)} disabled={i === 0} style={{ ...btn, background: '#333', color: '#ccc' }}>↑</button>
                  <button onClick={() => move(i, 1)} disabled={i === active.length - 1} style={{ ...btn, background: '#333', color: '#ccc' }}>↓</button>
                  <button onClick={() => editItem(it, { active: false })} title="Hide (its history is kept)" style={{ ...btn, background: '#333', color: '#f87171' }}>Hide</button>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 18, width: 24, textAlign: 'center' }}>{it.icon}</span>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <div style={{ color: on ? '#86efac' : '#eee', fontWeight: 600 }}>{it.name}</div>
                    <div style={{ color: '#777', fontSize: 11 }}>
                      {mins ? `${mins} min` : ''}
                      {/news|article/i.test(it.name) && day === today ? `${mins ? ' · ' : ''}${articles} read in Newsfeed today` : ''}
                    </div>
                  </div>
                  <input type="number" min={1} value={minutesDraft[it.id] ?? ''} onChange={e => setMinutesDraft(d => ({ ...d, [it.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') saveMinutes(it); }} placeholder="min" style={{ ...field, width: 60 }} aria-label={`Minutes of ${it.name}`} />
                  <div style={{ display: 'flex', gap: 2 }} aria-label="Last 14 days">
                    {last14.map(d => (
                      <span key={d} onClick={() => setDay(d)} title={`${label(d, today)}${isOn(it.id, d) ? ' ✓' : ''}`}
                        style={{ width: 9, height: 16, borderRadius: 2, cursor: 'pointer', background: isOn(it.id, d) ? '#22c55e' : '#1e1e2e', outline: d === day ? '1px solid #aaa' : 'none' }} />
                    ))}
                  </div>
                  <span title="Days in a row" style={{ color: s ? '#f97316' : '#555', fontWeight: 700, width: 44, textAlign: 'right' }}>🔥 {s}</span>
                </>
              )}
            </div>
          );
        })}
        {manage && (
          <div style={{ display: 'flex', gap: 8, padding: '10px 14px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input value={newItem.icon} onChange={e => setNewItem({ ...newItem, icon: e.target.value })} style={{ ...field, width: 40, textAlign: 'center' }} aria-label="New habit icon" />
            <input value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} onKeyDown={e => { if (e.key === 'Enter') addItem(); }}
              placeholder="New habit (e.g. Anabasis dev, Lathe practice)" style={{ ...field, flex: 1 }} />
            <button onClick={addItem} disabled={!newItem.name.trim()} style={{ ...btn, background: '#16a34a', color: '#fff' }}>+ Add</button>
            {items.some(i => !i.active) && (
              <span style={{ color: '#888', fontSize: 12 }}>Hidden: {items.filter(i => !i.active).map(i => (
                <button key={i.id} onClick={() => editItem(i, { active: true })} style={{ ...btn, padding: '2px 6px', background: 'none', color: '#60a5fa' }}>{i.icon} {i.name} ↩</button>
              ))}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}