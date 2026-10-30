'use client';

// ============================================================
// 📱 PHONE SYNC - your HServer calendar on your iPhone and Garmin watch
// ============================================================
// HServer publishes a private calendar address (an .ics feed). The iPhone
// subscribes to it once and re-reads it every 15 minutes; its alerts are your
// "clock" reminders, and the Garmin Connect app passes the phone's calendar
// and alerts on to the watch. One way: change things here, not on the phone.
// The address is the password — "New address" turns the old one off.
// ============================================================

import React, { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface Settings {
  alertMinutes: number;
  allDayAlert: string | null;
  includeReviews: boolean;
  dailyReview: string | null;
  checkin: string | null;
  daysBack: number;
}

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 };
const box: React.CSSProperties = { background: '#2a2a3a', padding: 20, borderRadius: 8, width: 560, maxWidth: '94vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid #444', color: '#ccc', fontSize: 13 };
const btn: React.CSSProperties = { border: 'none', padding: '7px 14px', borderRadius: 5, cursor: 'pointer', fontSize: 13 };
const input: React.CSSProperties = { background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '5px 8px', fontSize: 13 };
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' };

export function PhoneSyncButton({ style }: { style?: React.CSSProperties }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} title="Show this calendar on your iPhone and Garmin watch"
        style={{ background: '#333', border: 'none', color: '#ccc', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, ...style }}>
        📱 Phone sync
      </button>
      {open && <PhoneSyncDialog onClose={() => setOpen(false)} />}
    </>
  );
}

export default function PhoneSyncDialog({ onClose }: { onClose: () => void }) {
  const [path, setPath] = useState('');
  const [s, setS] = useState<Settings | null>(null);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${API_URL}/api/integrations/calendar`).then(async r => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || `Could not load (${r.status})`);
      setPath(d.path); setS(d.settings);
    }).catch(e => setError(e.message));
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const url = path ? `${API_URL.replace(/\/$/, '')}${path}` : '';
  const webcal = url.replace(/^https?:\/\//, 'webcal://');

  const save = async (next: Settings) => {
    setS(next); setSaved(''); setError('');
    try {
      const r = await fetch(`${API_URL}/api/integrations/calendar`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.message || 'Not saved');
      setS(d.settings); setSaved('Saved — the phone picks it up on its next refresh');
    } catch (e: any) { setError(e.message); }
  };

  const reset = async () => {
    if (!confirm('Make a new address? The phone stops updating until you subscribe again with the new one.')) return;
    const r = await fetch(`${API_URL}/api/integrations/calendar/reset`, { method: 'POST' });
    const d = await r.json().catch(() => ({}));
    if (r.ok) { setPath(d.path); setSaved('New address made — subscribe again on the phone'); }
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); }
    catch { window.prompt('Copy this address:', url); }
  };

  const time = (v: string | null, on: (v: string | null) => void, label: string) => (
    <div style={row}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 190 }}>
        <input type="checkbox" checked={!!v} onChange={e => on(e.target.checked ? '08:00' : null)} /> {label}
      </label>
      {v && <input type="time" value={v} onChange={e => on(e.target.value || null)} style={input} aria-label={`${label} time`} />}
    </div>
  );

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box} role="dialog" aria-label="Phone sync">
        <h3 style={{ color: '#fff', margin: '0 0 6px' }}>📱 Calendar on your phone & watch</h3>
        <div style={{ color: '#888', marginBottom: 12 }}>
          Your Calendar and Scheduler events, chapter reviews and daily reminders, with alerts. One way: add and change events here.
        </div>

        {error && <div style={{ color: '#f87171', marginBottom: 8 }}>{error}</div>}

        {url && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input readOnly value={url} onFocus={e => e.target.select()} aria-label="Calendar address" style={{ ...input, flex: 1, fontSize: 12 }} />
              <button onClick={copy} style={{ ...btn, background: '#0070f3', color: '#fff' }}>{copied ? '✓ Copied' : 'Copy'}</button>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14, fontSize: 12 }}>
              <a href={webcal} style={{ color: '#60a5fa' }}>Open on this iPhone →</a>
              <button onClick={reset} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>New address</button>
              <span style={{ color: '#666' }}>Keep it private: anyone with it can read your calendar.</span>
            </div>
          </>
        )}

        {s && (
          <div style={{ background: '#1e1e2e', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
            <div style={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}>⏰ Alerts</div>
            <div style={row}>
              <span style={{ minWidth: 190 }}>Timed events</span>
              <select value={s.alertMinutes} onChange={e => save({ ...s, alertMinutes: Number(e.target.value) })} style={input} aria-label="Alert before timed events">
                {[0, 5, 10, 15, 30, 60, 120].map(m => <option key={m} value={m}>{m === 0 ? 'at start time' : `${m} min before`}</option>)}
                <option value={-1}>no alert</option>
              </select>
            </div>
            {time(s.allDayAlert, v => save({ ...s, allDayAlert: v }), 'All-day events alert at')}
            <label style={{ ...row, cursor: 'pointer' }}>
              <input type="checkbox" checked={s.includeReviews} onChange={e => save({ ...s, includeReviews: e.target.checked })} /> 🔁 Chapter reviews on their due days
            </label>
            {time(s.dailyReview, v => save({ ...s, dailyReview: v }), '🧪 Daily review reminder')}
            {time(s.checkin, v => save({ ...s, checkin: v }), '✅ Daily habits reminder')}
            <div style={{ color: '#4ade80', minHeight: 16, fontSize: 12 }}>{saved}</div>
          </div>
        )}

        <div style={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}>iPhone (once)</div>
        <ol style={{ margin: '0 0 12px', paddingLeft: 20, lineHeight: 1.6 }}>
          <li>Copy the address above to the phone (AirDrop, Notes, or open this page on the phone).</li>
          <li>Settings → Apps → Calendar → Calendar Accounts → Add Account → Other → <b>Add Subscribed Calendar</b>.</li>
          <li>Paste the address → Next. Turn <b>Use SSL off</b> (HServer is plain http) → Save.</li>
          <li>Settings → Apps → Calendar → Calendar Accounts → <b>Fetch New Data</b> → Fetch → Every 15 minutes.</li>
          <li>Calendar app → Calendars: make sure <b>HServer</b> is ticked.</li>
        </ol>
        <div style={{ color: '#fff', fontWeight: 600, marginBottom: 4 }}>⌚ Garmin watch</div>
        <div style={{ marginBottom: 12, lineHeight: 1.5 }}>
          A watch paired in Garmin Connect buzzes with the iPhone&apos;s alerts, so these alerts reach it too. Check:
          iPhone Settings → Notifications → <b>Calendar</b> → Allow Notifications and Lock Screen on, and the watch&apos;s
          Smart Notifications on (Garmin Connect app → your watch → Notifications &amp; Alerts). Watches with a{' '}
          <b>Calendar</b> glance/widget also list the day&apos;s HServer events.
        </div>
        <div style={{ color: '#888', fontSize: 12, marginBottom: 12 }}>
          Away from home the phone updates only while WireGuard is on (set it to connect on demand). Old events beyond {s?.daysBack ?? 60} days are left out.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ ...btn, background: '#333', color: '#ccc' }}>Close</button>
        </div>
      </div>
    </div>
  );
}