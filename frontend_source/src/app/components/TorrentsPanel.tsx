'use client';

// ============================================================
// ⬇ TORRENTS — qBittorrent on HServer, always behind its own VPN
// ============================================================
// Paste a magnet link (or pick a .torrent file), optionally for a node.
// Finished downloads appear in 📁 Files automatically (then their
// text is read and videos are converted for the browser).
// If the torrent VPN is down, qBittorrent can't connect at all —
// your home IP is never used.
// ============================================================

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Node } from '@/lib/types';
import { formatSize, formatDuration } from '@/lib/files';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface Torrent {
  hash: string; name: string; size: number; progress: number;
  dlspeed: number; upspeed: number; eta: number; state: string;
  seeds: number; peers: number; ratio: number; addedOn: number;
  nodeId: number | null; done: boolean; imported: boolean;
}

interface Status {
  configured: boolean; reachable: boolean; version: string | null; error: string | null;
  vpn: { ip: string; country: string; city: string } | null;
  forwardedPort: number | null;
}

const btn: React.CSSProperties = { background: '#333', color: '#ccc', border: 'none', borderRadius: 4, padding: '5px 10px', fontSize: 12, cursor: 'pointer' };
const input: React.CSSProperties = { background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '6px 8px', fontSize: 12 };

const STATE_LABEL: Record<string, string> = {
  downloading: 'Downloading', forcedDL: 'Downloading', metaDL: 'Getting info', stalledDL: 'Waiting for peers',
  queuedDL: 'Queued', pausedDL: 'Paused', stoppedDL: 'Paused', checkingDL: 'Checking', checkingResumeData: 'Checking',
  uploading: 'Seeding', forcedUP: 'Seeding', stalledUP: 'Done', queuedUP: 'Done', pausedUP: 'Done', stoppedUP: 'Done',
  checkingUP: 'Checking', error: 'Error', missingFiles: 'Files missing', moving: 'Moving',
};
const speed = (b: number) => (b > 0 ? `${formatSize(b)}/s` : '');

export default function TorrentsPanel({ nodes = [] }: { nodes?: Node[] }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [torrents, setTorrents] = useState<Torrent[]>([]);
  const [links, setLinks] = useState('');
  const [nodeId, setNodeId] = useState<string>('');
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const s = await fetch(`${API_URL}/api/mindmap/torrents/status`).then(r => r.json());
      setStatus(s);
      if (s.reachable) {
        const list = await fetch(`${API_URL}/api/mindmap/torrents`).then(r => (r.ok ? r.json() : []));
        setTorrents(Array.isArray(list) ? list : []);
      }
    } catch {
      setStatus({ configured: false, reachable: false, version: null, error: 'Could not reach the backend', vpn: null, forwardedPort: null });
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const add = async (file?: File) => {
    if (!links.trim() && !file) return;
    setAdding(true);
    setMessage(null);
    const form = new FormData();
    if (links.trim()) form.append('urls', links.trim());
    if (file) form.append('file', file);
    if (nodeId) form.append('nodeId', nodeId);
    try {
      const res = await fetch(`${API_URL}/api/mindmap/torrents`, { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || `Failed (${res.status})`);
      setLinks('');
      setMessage({ text: 'Added.' });
      load();
    } catch (e: any) {
      setMessage({ text: e?.message || 'Could not add it', error: true });
    }
    setAdding(false);
  };

  const act = async (t: Torrent, action: 'pause' | 'resume') => {
    await fetch(`${API_URL}/api/mindmap/torrents/${t.hash}/${action}`, { method: 'POST' }).catch(() => {});
    load();
  };

  const remove = async (t: Torrent) => {
    if (!confirm(`Remove “${t.name}” from qBittorrent?`)) return;
    const deleteFiles = confirm('Also delete the downloaded files?\n\nOK = delete them (they go to the Trash)\nCancel = keep them in 📁 Files');
    await fetch(`${API_URL}/api/mindmap/torrents/${t.hash}?files=${deleteFiles}`, { method: 'DELETE' }).catch(() => {});
    load();
  };

  const sortedNodes = useMemo(() => [...nodes].sort((a, b) => a.name.localeCompare(b.name)), [nodes]);
  const nodeName = (id: number | null) => (id ? nodes.find(n => n.id === id)?.name : null);

  return (
    <div style={{ padding: '8px 24px', color: '#ccc' }}>
      {/* Connection */}
      <div style={{ fontSize: 13, marginBottom: 12 }}>
        {!status ? <span style={{ color: '#666' }}>Checking…</span>
          : !status.configured ? <span style={{ color: '#f59e0b' }}>Torrents aren&apos;t set up yet — start the torrent VPN and qBittorrent on HServer and set QBIT_PASS (see configs/gluetun/README.md).</span>
          : !status.reachable ? <span style={{ color: '#f87171' }}>⚠ qBittorrent isn&apos;t reachable ({status.error}). If the torrent VPN is down, nothing downloads — your home IP is never used.</span>
          : status.vpn ? <span style={{ color: '#22c55e' }}>🔒 Torrents go through {status.vpn.city ? `${status.vpn.city}, ` : ''}{status.vpn.country} · {status.vpn.ip}{status.forwardedPort ? ` · port ${status.forwardedPort} forwarded` : ''}</span>
          : <span style={{ color: '#f59e0b' }}>qBittorrent {status.version} is up, but the VPN address couldn&apos;t be checked.</span>}
      </div>

      {/* Add */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 8 }}>
        <textarea value={links} onChange={e => setLinks(e.target.value)} rows={2} placeholder="Paste magnet link(s) or a .torrent URL"
          style={{ ...input, flex: '1 1 320px', resize: 'vertical' }} />
        <select value={nodeId} onChange={e => setNodeId(e.target.value)} title="Node the finished files belong to" style={{ ...input, maxWidth: 180 }}>
          <option value="">— no node —</option>
          {sortedNodes.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
        </select>
        <button onClick={() => add()} disabled={adding || !links.trim() || !status?.reachable} style={{ ...btn, background: '#0070f3', color: '#fff' }}>{adding ? 'Adding…' : 'Add'}</button>
        <button onClick={() => fileRef.current?.click()} disabled={adding || !status?.reachable} style={btn}>.torrent file…</button>
        <input ref={fileRef} type="file" accept=".torrent,application/x-bittorrent" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) add(f); e.target.value = ''; }} />
      </div>
      {message && <div style={{ fontSize: 12, marginBottom: 8, color: message.error ? '#ef4444' : '#22c55e' }}>{message.text}</div>}

      {/* List */}
      {status?.reachable && torrents.length === 0 && <div style={{ color: '#666', padding: 20, textAlign: 'center', fontSize: 13 }}>No torrents.</div>}
      {torrents.map(t => {
        const paused = /^(paused|stopped)/.test(t.state);
        const pct = Math.round(t.progress * 1000) / 10;
        return (
          <div key={t.hash} style={{ padding: '10px 4px', borderBottom: '1px solid #2a2a2a' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1, minWidth: 0, color: '#eee', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.name}>{t.name}</div>
              {!t.done && <button onClick={() => act(t, paused ? 'resume' : 'pause')} style={btn}>{paused ? '▶ Resume' : '⏸ Pause'}</button>}
              <button onClick={() => remove(t)} title="Remove" style={{ ...btn, color: '#ef4444' }}>✕</button>
            </div>
            <div style={{ height: 5, background: '#333', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: t.done ? '#22c55e' : t.state === 'error' ? '#ef4444' : '#0070f3' }} />
            </div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>
              {STATE_LABEL[t.state] || t.state} · {pct}% of {formatSize(t.size)}
              {!t.done && t.dlspeed > 0 && <> · ↓ {speed(t.dlspeed)}</>}
              {t.upspeed > 0 && <> · ↑ {speed(t.upspeed)}</>}
              {!t.done && t.eta > 0 && t.eta < 8640000 && <> · {formatDuration(t.eta)} left</>}
              {!t.done && <> · {t.seeds} seeds, {t.peers} peers</>}
              {nodeName(t.nodeId) && <> · for {nodeName(t.nodeId)}</>}
              {t.imported && <span style={{ color: '#22c55e' }}> · ✓ in 📁 Files</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}