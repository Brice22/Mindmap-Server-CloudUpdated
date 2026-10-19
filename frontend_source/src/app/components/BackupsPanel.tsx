'use client';

// ============================================================
// 💾 BACKUPS — nightly, encrypted (restic), drive + cloud
// ============================================================
// The "backup" container does the work (configs/backup); this shows
// what it reports: last backup, each destination (backup drive,
// Backblaze B2), the restore test, the saved copies, and a
// "Back up now" button.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { formatSize } from '@/lib/files';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface Snapshot { id: string; time: string; files: number | null; size: number | null; added: number | null }
interface Repo {
  name: 'drive' | 'cloud'; label: string; target: string; ok: boolean; error: string | null;
  lastRun: string; lastSuccess?: string; snapshot: string | null; added: number; files: number;
  verified: boolean; snapshots?: Snapshot[]; repoSize?: number; lastCheck?: string; checkOk?: boolean;
}
interface Status {
  installed: boolean; alive: boolean; requested: boolean;
  running?: boolean; phase?: string | null; startedAt?: string; finishedAt?: string; ok?: boolean; error?: string | null;
  duration?: number; lastSuccess?: string; nextRun?: string; schedule?: string; includeTorrents?: boolean;
  keep?: { last?: number; daily: number; weekly: number; monthly: number };
  dumps?: { postgres: string; vaultwarden: string };
  repos: Repo[];
}

const btn: React.CSSProperties = { background: '#333', border: 'none', color: '#ccc', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 };
const card: React.CSSProperties = { background: '#2a2a3a', borderRadius: 8, padding: 14, marginBottom: 14 };
const h3: React.CSSProperties = { color: '#aaa', fontSize: 12, textTransform: 'uppercase', margin: '0 0 10px', letterSpacing: 0.5 };
const code: React.CSSProperties = { fontFamily: 'monospace', background: '#111', color: '#ddd', padding: '1px 6px', borderRadius: 3, fontSize: 12 };

const when = (iso?: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const today = new Date();
  const yest = new Date(Date.now() - 86400_000);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `today ${time}`;
  if (d.toDateString() === yest.toDateString()) return `yesterday ${time}`;
  if (d.getTime() > Date.now() && d.getTime() - Date.now() < 86400_000) return `tonight ${time}`;
  return `${d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })} ${time}`;
};
const hoursSince = (iso?: string) => (iso ? (Date.now() - new Date(iso).getTime()) / 3600_000 : Infinity);

export default function BackupsPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [log, setLog] = useState<string[] | null>(null);
  const [asking, setAsking] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/backups`);
      if (!res.ok) throw new Error(String(res.status));
      setStatus(await res.json());
      setError('');
    } catch {
      setError('Could not reach the backend.');
    }
  }, []);

  const busy = !!(status?.running || status?.requested);
  useEffect(() => {
    load();
    const t = setInterval(load, busy ? 3000 : 20_000);
    return () => clearInterval(t);
  }, [load, busy]);

  const runNow = async () => {
    setAsking(true);
    try {
      const res = await fetch(`${API_URL}/api/backups/run`, { method: 'POST' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Failed');
    } catch (e: any) { setError(e?.message || 'Failed'); }
    setAsking(false);
    load();
  };
  const showLog = async () => {
    if (log) { setLog(null); return; }
    const r = await fetch(`${API_URL}/api/backups/log`).then(r => r.json()).catch(() => ({ lines: [] }));
    setLog(r.lines || []);
  };

  if (error && !status) return <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>;
  if (!status) return <div style={{ color: '#666' }}>Checking backups…</div>;

  if (!status.installed) {
    return (
      <div style={{ ...card, fontSize: 13, lineHeight: 1.6, maxWidth: 760 }}>
        <div style={{ color: '#f59e0b', marginBottom: 6 }}>Backups aren&apos;t set up yet.</div>
        On HServer: plug in the backup drive, fill in <span style={code}>/srv/hserverdir-data/backup/backup.env</span> and run
        {' '}<span style={code}>docker compose up -d --build backup</span> — the steps are in <span style={code}>configs/backup/README.md</span>.
      </div>
    );
  }

  // Overall health: good if the last good backup is under ~26 h old
  const stale = hoursSince(status.lastSuccess) > 26;
  const headline = status.running ? `⏳ Backing up… ${status.phase || ''}`
    : status.requested ? '⏳ Starting a backup…'
    : !status.lastSuccess ? '⚠ No backup has finished yet'
    : stale ? `⚠ Last good backup was ${when(status.lastSuccess)}`
    : status.ok ? `✓ Backed up ${when(status.lastSuccess)}`
    : `⚠ Last backup ${when(status.finishedAt)} had problems`;
  const color = status.running || status.requested ? '#60a5fa' : status.ok && !stale ? '#22c55e' : '#f59e0b';

  return (
    <div style={{ color: '#ccc', maxWidth: 900 }}>
      {/* SUMMARY */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ color, fontWeight: 600, fontSize: 15 }}>{headline}</div>
          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            {!status.alive && <span style={{ color: '#f87171' }}>The backup container isn&apos;t running · </span>}
            Next: {when(status.nextRun)}{status.duration ? ` · last run took ${Math.max(1, Math.round(status.duration / 60))} min` : ''}
            {status.keep ? ` · keeps ${status.keep.last ? `the last ${status.keep.last} + ` : ''}${status.keep.daily} daily, ${status.keep.weekly} weekly, ${status.keep.monthly} monthly` : ''}
          </div>
          {status.error && !status.running && <div style={{ fontSize: 12, color: '#f87171', marginTop: 4 }}>{status.error}</div>}
        </div>
        <button onClick={runNow} disabled={busy || asking || !status.alive} style={{ ...btn, background: busy ? '#333' : '#0070f3', color: '#fff', opacity: status.alive ? 1 : 0.5 }}>
          {busy ? 'Running…' : 'Back up now'}
        </button>
        <button onClick={showLog} style={btn}>{log ? 'Hide log' : 'Log'}</button>
      </div>

      {log && (
        <pre style={{ ...card, fontSize: 11, maxHeight: 280, overflow: 'auto', whiteSpace: 'pre-wrap', color: '#aaa' }}>{log.join('\n') || 'Empty'}</pre>
      )}

      {/* DESTINATIONS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
        {status.repos.length === 0 && <div style={{ ...card, color: '#888', fontSize: 13 }}>No backup has run yet.</div>}
        {status.repos.map(r => {
          const good = r.ok && hoursSince(r.lastSuccess) < 26;
          return (
            <div key={r.name} style={{ ...card, border: `1px solid ${good ? '#14532d' : '#7c2d12'}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24 }}>{r.name === 'drive' ? '💽' : '☁️'}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ color: '#fff', fontWeight: 600 }}>{r.label}</div>
                  <div style={{ fontSize: 11, color: '#777', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.target}>{r.target}</div>
                </div>
              </div>
              <div style={{ fontSize: 12, marginTop: 10, lineHeight: 1.7 }}>
                <div style={{ color: good ? '#22c55e' : '#f59e0b' }}>
                  {good ? `✓ Last backup ${when(r.lastSuccess)}` : r.lastSuccess ? `⚠ Last good backup ${when(r.lastSuccess)}` : '⚠ No good backup yet'}
                </div>
                {r.error && <div style={{ color: r.ok ? '#f59e0b' : '#f87171' }}>{r.error}</div>}
                {r.ok && <div>{r.verified ? '✓ Restore test passed (database read back from the backup)' : '⚠ Restore test not done'}</div>}
                {r.lastCheck && <div style={{ color: r.checkOk ? '#888' : '#f87171' }}>{r.checkOk ? '✓' : '⚠'} Weekly data check {when(r.lastCheck)}</div>}
                <div style={{ color: '#888' }}>
                  {r.snapshots?.length ?? 0} copies · {formatSize(r.repoSize || 0)} stored{r.ok ? ` · last run added ${formatSize(r.added || 0)}` : ''}
                </div>
              </div>
              {!!r.snapshots?.length && (
                <button onClick={() => setOpen(open === r.name ? null : r.name)} style={{ ...btn, marginTop: 8 }}>
                  {open === r.name ? 'Hide copies' : 'Show copies'}
                </button>
              )}
              {open === r.name && (
                <div style={{ marginTop: 8, maxHeight: 240, overflow: 'auto' }}>
                  {r.snapshots!.map(s => (
                    <div key={s.id} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '3px 0', borderBottom: '1px solid #333' }}>
                      <span style={{ flex: 1 }}>{when(s.time)}</span>
                      <span style={{ color: '#888' }}>{s.files != null ? `${s.files.toLocaleString()} files` : ''}</span>
                      <span style={{ color: '#888', width: 80, textAlign: 'right' }}>{s.size != null ? formatSize(s.size) : ''}</span>
                      <span style={{ ...code, fontSize: 10 }}>{s.id}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* WHAT'S IN IT */}
      <div style={{ ...card, fontSize: 12, lineHeight: 1.7 }}>
        <h3 style={h3}>What&apos;s backed up</h3>
        <div>✓ Database (mindmap, docs, flashcards, finance, health… and Keycloak){status.dumps ? ` — last dump: ${status.dumps.postgres}` : ''}</div>
        <div>✓ Vaultwarden passwords{status.dumps ? ` — ${status.dumps.vaultwarden}` : ''}</div>
        <div>✓ Your files, saved pages, drawings (cloud_data) · settings for Pi-hole, WireGuard, VPN, qBittorrent · .env</div>
        <div style={{ color: '#888' }}>✗ Not backed up: browser/720p video copies (remade automatically){status.includeTorrents ? '' : ', torrent downloads (INCLUDE_TORRENTS=yes to add them)'}, search index (rebuilt), caches.</div>
        <div style={{ color: '#888', marginTop: 6 }}>
          Restoring: see <span style={code}>configs/backup/README.md</span>. Without <span style={code}>RESTIC_PASSWORD</span> the backups can&apos;t be opened — keep a copy somewhere other than HServer.
        </div>
      </div>
    </div>
  );
}