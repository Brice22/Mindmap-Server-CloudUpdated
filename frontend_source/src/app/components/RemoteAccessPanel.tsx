'use client';

// ============================================================
// 🏠 REMOTE ACCESS — reach HServer from anywhere (WireGuard)
// ============================================================
// Split tunnel: on WireGuard only HServer (10.10.0.x) and DNS go
// home — the app, your files, the region proxies and Pi-hole (ads
// stay blocked). Everything else goes straight out, so it's fast.
// Shows: does your DuckDNS name point at home? which devices are
// connected? and each device's setup QR (needs the SETUP_PIN).
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { formatSize } from '@/lib/files';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface Peer { name: string; address: string | null; online: boolean; lastHandshake: string | null; rx: number; tx: number; hasQr: boolean }
interface Status {
  hostname: string | null; port: number; publicIp: string | null; hostnameIp: string | null; dnsOk: boolean;
  serverRunning: boolean; statusUpdatedAt: string | null;
  tunnel: { allowedIps: string | null; dns: string | null; endpoint: string | null };
  peers: Peer[]; canShowSetup: boolean;
}

const btn: React.CSSProperties = { background: '#333', border: 'none', color: '#ccc', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 };
const card: React.CSSProperties = { background: '#2a2a3a', borderRadius: 8, padding: 14, marginBottom: 14 };
const h3: React.CSSProperties = { color: '#aaa', fontSize: 12, textTransform: 'uppercase', margin: '0 0 10px', letterSpacing: 0.5 };
const code: React.CSSProperties = { fontFamily: 'monospace', background: '#111', color: '#ddd', padding: '1px 6px', borderRadius: 3, fontSize: 12 };

const ago = (iso: string | null) => {
  if (!iso) return 'never connected';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `last seen ${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `last seen ${Math.round(s / 3600)} h ago`;
  return `last seen ${Math.round(s / 86400)} days ago`;
};
const icon = (name: string) => (/phone|iphone|android|pixel/i.test(name) ? '📱' : /tablet|ipad/i.test(name) ? '📲' : /laptop|mac|pc|desktop/i.test(name) ? '💻' : /tv/i.test(name) ? '📺' : '🖥️');

export default function RemoteAccessPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState('');
  const [pin, setPin] = useState('');
  const [setup, setSetup] = useState<{ name: string; qr: string | null; error?: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/vpn/status`);
      if (!res.ok) throw new Error(String(res.status));
      setStatus(await res.json());
      setError('');
    } catch {
      setError('Could not reach the backend.');
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load]);

  // QR/config contain the device's key → fetched with the PIN, never cached
  const openSetup = async (p: Peer) => {
    setSetup({ name: p.name, qr: null });
    try {
      const res = await fetch(`${API_URL}/api/vpn/peers/${p.name}/qr`, { headers: { 'x-setup-pin': pin }, cache: 'no-store' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || `Failed (${res.status})`);
      setSetup({ name: p.name, qr: URL.createObjectURL(await res.blob()) });
    } catch (e: any) {
      setSetup({ name: p.name, qr: null, error: e?.message || 'Failed' });
    }
  };
  const downloadConf = async (name: string) => {
    const res = await fetch(`${API_URL}/api/vpn/peers/${name}/config`, { headers: { 'x-setup-pin': pin }, cache: 'no-store' });
    if (!res.ok) return;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url; a.download = `hserver-${name}.conf`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const closeSetup = () => { if (setup?.qr) URL.revokeObjectURL(setup.qr); setSetup(null); };

  if (error) return <div style={{ color: '#ef4444', fontSize: 13 }}>{error}</div>;
  if (!status) return <div style={{ color: '#666' }}>Checking remote access…</div>;

  const s = status;
  return (
    <div style={{ color: '#ccc', maxWidth: 900 }}>
      {/* ADDRESS */}
      <div style={card}>
        <h3 style={h3}>Your address from outside</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 13, alignItems: 'center' }}>
          <span style={{ color: '#888' }}>Name</span>
          <span>{s.hostname ? <span style={code}>{s.hostname}</span> : <span style={{ color: '#f59e0b' }}>not set — put WIREGUARD_SERVER_URL=yourname.duckdns.org in .env</span>}</span>
          <span style={{ color: '#888' }}>Home IP now</span>
          <span style={code}>{s.publicIp || 'unknown'}</span>
          <span style={{ color: '#888' }}>Name points to</span>
          <span>
            <span style={code}>{s.hostnameIp || '—'}</span>{' '}
            {s.hostname && (s.dnsOk
              ? <span style={{ color: '#22c55e' }}>✓ up to date</span>
              : <span style={{ color: '#ef4444' }}>✗ {s.hostnameIp ? 'out of date — check the duckdns container (DUCK_TOKEN, DUCKDNS_SUBDOMAIN)' : "doesn't resolve yet"}</span>)}
          </span>
          <span style={{ color: '#888' }}>WireGuard</span>
          <span>
            {s.serverRunning ? <span style={{ color: '#22c55e' }}>● running</span> : <span style={{ color: '#f87171' }}>● no status (is the wireguard_status container running?)</span>}
            <span style={{ color: '#888' }}> · UDP {s.port}{s.tunnel.allowedIps ? ` · goes home: ${s.tunnel.allowedIps}` : ''}</span>
          </span>
        </div>
        <button onClick={() => setShowHelp(h => !h)} style={{ ...btn, marginTop: 12 }}>{showHelp ? 'Hide setup' : 'Setup checklist'}</button>
        {showHelp && (
          <ol style={{ fontSize: 13, lineHeight: 1.7, margin: '10px 0 0', paddingLeft: 20 }}>
            <li><b>Eero app</b> → Settings → Network settings → Reservations &amp; port forwarding → HServer → reserve its IP (192.168.4.194) → Add a port forward: <span style={code}>51820</span> UDP.</li>
            <li><b>Check you have a real public IP:</b> Eero app → Settings → Network settings → it shows the WAN IP. If it isn&apos;t the same as &quot;Home IP now&quot; above (or starts with 100.64–100.127), your internet provider uses CGNAT and port forwarding can&apos;t work — ask them for a public IP.</li>
            <li><b>DuckDNS:</b> duckdns.org → your subdomain + token in <span style={code}>.env</span> (DUCKDNS_SUBDOMAIN, DUCK_TOKEN, WIREGUARD_SERVER_URL).</li>
            <li><b>Each device:</b> install the WireGuard app → add tunnel → scan the QR below (phone) or import the .conf (laptop). Re-scan after this update — the tunnel settings changed.</li>
            <li><b>Test:</b> turn Wi-Fi off on the phone, turn WireGuard on, open <span style={code}>https://10.10.0.1</span>.</li>
          </ol>
        )}
      </div>

      {/* AWAY FROM HOME */}
      <div style={card}>
        <h3 style={h3}>On WireGuard, away from home</h3>
        <div style={{ fontSize: 13, lineHeight: 1.7 }}>
          <div>App &amp; files: <span style={code}>https://10.10.0.1</span></div>
          <div>Region proxies: <span style={code}>10.10.0.1</span> instead of 192.168.4.194 (same ports)</div>
          <div>Ad blocking: automatic (DNS is Pi-hole{s.tunnel.dns ? ` ${s.tunnel.dns}` : ''})</div>
          <div style={{ color: '#888' }}>Everything else goes straight to the internet, not through home.</div>
        </div>
      </div>

      {/* DEVICES */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10, gap: 8, flexWrap: 'wrap' }}>
          <h3 style={{ ...h3, margin: 0, flex: 1 }}>Devices ({s.peers.length})</h3>
          {s.canShowSetup && (
            <input type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="Setup PIN"
              style={{ background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '5px 8px', fontSize: 12, width: 110 }} />
          )}
        </div>
        {s.peers.length === 0 && <div style={{ color: '#666', fontSize: 12 }}>No devices found — is the wireguard container running?</div>}
        {s.peers.map(p => (
          <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #333' }}>
            <div style={{ fontSize: 22 }}>{icon(p.name)}</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 14, textTransform: 'capitalize' }}>{p.name}</div>
              <div style={{ fontSize: 11, color: p.online ? '#22c55e' : '#888' }}>
                {p.online ? '● connected' : ago(p.lastHandshake)}
                {p.address ? <span style={{ color: '#666' }}> · {p.address}</span> : null}
                {(p.rx || p.tx) ? <span style={{ color: '#666' }}> · ↓ {formatSize(p.tx)} ↑ {formatSize(p.rx)}</span> : null}
              </div>
            </div>
            {s.canShowSetup
              ? <button onClick={() => openSetup(p)} disabled={!pin} title={pin ? '' : 'Type the setup PIN first'} style={{ ...btn, opacity: pin ? 1 : 0.5 }}>Set up device</button>
              : <span style={{ fontSize: 11, color: '#666' }} title="Set SETUP_PIN in .env to show it here">on HServer: <span style={code}>docker exec -it wireguard /app/show-peer {p.name}</span></span>}
          </div>
        ))}
        <div style={{ fontSize: 12, color: '#888', marginTop: 10 }}>
          Add a device: add its name to <span style={code}>WG_PEERS</span> in .env (e.g. phone,laptop,tablet,worklaptop), then on HServer <span style={code}>docker compose up -d wireguard</span>.
        </div>
      </div>

      {/* SETUP DIALOG */}
      {setup && (
        <div onClick={closeSetup} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#2a2a3a', border: '1px solid #444', borderRadius: 8, padding: 20, width: 340, textAlign: 'center' }}>
            <div style={{ color: '#fff', fontWeight: 600, marginBottom: 10, textTransform: 'capitalize' }}>Set up {setup.name}</div>
            {setup.error ? <div style={{ color: '#ef4444', fontSize: 13 }}>{setup.error}</div>
              : setup.qr ? <img src={setup.qr} alt="WireGuard QR code" style={{ width: 260, height: 260, background: '#fff', borderRadius: 6 }} />
              : <div style={{ color: '#888' }}>Loading…</div>}
            <div style={{ fontSize: 12, color: '#999', margin: '10px 0' }}>WireGuard app → + → Scan from QR code. This code is the device&apos;s key — don&apos;t share it.</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              {!setup.error && <button onClick={() => downloadConf(setup.name)} style={btn}>Download .conf</button>}
              <button onClick={closeSetup} style={{ ...btn, background: '#0070f3', color: '#fff' }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}