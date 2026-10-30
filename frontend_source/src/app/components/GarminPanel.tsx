'use client';

// ============================================================
// ⌚ GARMIN - your watch's daily numbers in 🏥 Health
// ============================================================
// The garmin_sync container reads Garmin Connect every couple of hours
// (sleep, steps, resting heart rate, stress, Body Battery, calories,
// intensity minutes, water, and food logged in Garmin Connect or
// MyFitnessPal linked to it). "Sync now" asks it to run at once; if Garmin
// emails/texts you a login code, type it here.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';

interface Day {
  day: string; steps: number | null; resting_hr: number | null; stress_avg: number | null;
  body_battery_high: number | null; body_battery_low: number | null; calories_total: number | null; calories_active: number | null;
  intensity_minutes: number | null; sleep_seconds: number | null; sleep_score: number | null; hydration_ml: number | null;
  food_calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null;
}

const btn: React.CSSProperties = { border: 'none', padding: '6px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12 };
const n = (v: any, digits = 0) => (v == null ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: digits }));
const hm = (s: number | null) => (s == null ? '—' : `${Math.floor(s / 3600)}h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}m`);
const oz = (ml: number | null) => (ml == null ? '—' : `${Math.round(ml / 29.5735)} oz`);
const STATE: Record<string, [string, string]> = {
  ok: ['✓ Synced', '#4ade80'], syncing: ['🔄 Syncing…', '#60a5fa'], needs_mfa: ['🔑 Garmin sent a code', '#facc15'],
  error: ['⚠ Problem', '#f87171'], no_credentials: ['⚠ Login not set', '#f87171'], not_running: ['○ Not running', '#888'],
};

const TILES: { label: string; icon: string; show: (d: Day) => string }[] = [
  { label: 'Sleep', icon: '😴', show: d => `${hm(d.sleep_seconds)}${d.sleep_score != null ? ` · ${d.sleep_score}` : ''}` },
  { label: 'Steps', icon: '👟', show: d => n(d.steps) },
  { label: 'Resting HR', icon: '❤️', show: d => (d.resting_hr == null ? '—' : `${d.resting_hr} bpm`) },
  { label: 'Stress', icon: '🧠', show: d => n(d.stress_avg) },
  { label: 'Body Battery', icon: '🔋', show: d => (d.body_battery_high == null ? '—' : `${d.body_battery_low ?? '?'}–${d.body_battery_high}`) },
  { label: 'Burned', icon: '🔥', show: d => (d.calories_total == null ? '—' : `${n(d.calories_total)} kcal`) },
  { label: 'Intensity min', icon: '🏃', show: d => n(d.intensity_minutes) },
  { label: 'Water', icon: '💧', show: d => oz(d.hydration_ml) },
  { label: 'Eaten', icon: '🍽️', show: d => (d.food_calories == null ? '—' : `${n(d.food_calories)} kcal`) },
  { label: 'Protein / carbs / fat', icon: '🥩', show: d => (d.protein_g == null && d.carbs_g == null ? '—' : `${n(d.protein_g)} / ${n(d.carbs_g)} / ${n(d.fat_g)} g`) },
];

export default function GarminPanel({ apiUrl }: { apiUrl: string }) {
  const [o, setO] = useState<any>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [showTable, setShowTable] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${apiUrl}/api/integrations/garmin?days=30`);
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || `Could not load Garmin (${r.status})`);
      setO(d); setError('');
    } catch (e: any) { setError(e.message); }
  }, [apiUrl]);
  useEffect(() => { load(); }, [load]);

  // Watch closely while something is happening
  const active = o && (o.syncRequested || o.state === 'syncing' || o.state === 'needs_mfa');
  useEffect(() => {
    if (!active) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [active, load]);

  const post = async (path: string, body?: any) => {
    setError('');
    try {
      const r = await fetch(`${apiUrl}/api/integrations/garmin/${path}`, {
        method: 'POST', headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || 'Failed');
      await load();
    } catch (e: any) { setError(e.message); }
  };

  if (!o) return error ? <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>⌚ {error}</div> : null;

  const state = o.running ? o.state : 'not_running';
  const [label, color] = STATE[state] || [state, '#ccc'];
  const today = o.days[0] as Day | undefined;

  return (
    <div style={{ background: '#2a2a3a', padding: 16, borderRadius: 8, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <div>
          <b style={{ color: '#fff' }}>⌚ Garmin</b>
          <span style={{ color, marginLeft: 8, fontSize: 12 }}>{label}</span>
          {o.lastSync && <span style={{ color: '#666', marginLeft: 8, fontSize: 12 }}>last {new Date(o.lastSync).toLocaleString()}</span>}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {o.days.length > 0 && (
            <button onClick={() => setShowTable(v => !v)} style={{ ...btn, background: '#333', color: '#ccc' }}>{showTable ? 'Hide days' : '📋 30 days'}</button>
          )}
          <button onClick={() => post('sync')} disabled={!o.running || o.syncRequested}
            style={{ ...btn, background: o.running ? '#0070f3' : '#333', color: o.running ? '#fff' : '#777' }}>
            {o.syncRequested ? 'Asked…' : '🔄 Sync now'}
          </button>
        </div>
      </div>

      {o.message && state !== 'ok' && <div style={{ color: '#aaa', fontSize: 12, marginTop: 6 }}>{o.message}</div>}
      {!o.running && (
        <div style={{ color: '#888', fontSize: 12, marginTop: 6 }}>
          {o.keySet ? 'The garmin_sync container hasn’t checked in for 5+ minutes — start it on HServer (docker compose up -d garmin_sync).'
            : 'Set GARMIN_SYNC_KEY in .env and start the garmin_sync container (see the guide).'}
        </div>
      )}
      {state === 'needs_mfa' && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="Code from Garmin" inputMode="numeric" aria-label="Garmin code"
            onKeyDown={e => { if (e.key === 'Enter' && code.trim()) { post('mfa', { code }); setCode(''); } }}
            style={{ background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '6px 8px', width: 160 }} />
          <button onClick={() => { post('mfa', { code }); setCode(''); }} disabled={!code.trim()} style={{ ...btn, background: '#0070f3', color: '#fff' }}>Send code</button>
        </div>
      )}
      {error && <div style={{ color: '#f87171', fontSize: 12, marginTop: 6 }}>{error}</div>}

      {today && (
        <>
          <div style={{ color: '#666', fontSize: 11, margin: '10px 0 6px' }}>{today.day === new Date().toLocaleDateString('en-CA') ? 'Today' : today.day}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
            {TILES.map(t => (
              <div key={t.label} style={{ background: '#1e1e2e', borderRadius: 6, padding: '8px 10px' }}>
                <div style={{ color: '#888', fontSize: 11 }}>{t.icon} {t.label}</div>
                <div style={{ color: '#fff', fontSize: 15, fontWeight: 600, marginTop: 2 }}>{t.show(today)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {showTable && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
            <thead>
              <tr style={{ color: '#888', textAlign: 'right' }}>
                {['Day', 'Sleep', 'Score', 'Steps', 'RHR', 'Stress', 'Battery', 'Burned', 'Eaten', 'P/C/F g', 'Water'].map(h => (
                  <th key={h} style={{ padding: '4px 6px', fontWeight: 500, textAlign: h === 'Day' ? 'left' : 'right' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(o.days as Day[]).map(d => (
                <tr key={d.day} style={{ borderTop: '1px solid #333', color: '#ddd', textAlign: 'right' }}>
                  <td style={{ padding: '4px 6px', textAlign: 'left', whiteSpace: 'nowrap' }}>{d.day.slice(5)}</td>
                  <td style={{ padding: '4px 6px' }}>{hm(d.sleep_seconds)}</td>
                  <td style={{ padding: '4px 6px' }}>{n(d.sleep_score)}</td>
                  <td style={{ padding: '4px 6px' }}>{n(d.steps)}</td>
                  <td style={{ padding: '4px 6px' }}>{n(d.resting_hr)}</td>
                  <td style={{ padding: '4px 6px' }}>{n(d.stress_avg)}</td>
                  <td style={{ padding: '4px 6px' }}>{d.body_battery_high == null ? '—' : `${d.body_battery_low ?? '?'}–${d.body_battery_high}`}</td>
                  <td style={{ padding: '4px 6px' }}>{n(d.calories_total)}</td>
                  <td style={{ padding: '4px 6px' }}>{n(d.food_calories)}</td>
                  <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>{d.protein_g == null && d.carbs_g == null ? '—' : `${n(d.protein_g)}/${n(d.carbs_g)}/${n(d.fat_g)}`}</td>
                  <td style={{ padding: '4px 6px' }}>{oz(d.hydration_ml)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}