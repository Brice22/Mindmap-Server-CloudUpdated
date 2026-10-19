'use client';

// ============================================================
// 🌍 REGIONS — browse & stream as if you were in another country
// ============================================================
// Each region is a VPN connection on HServer (gluetun) with two
// proxies your devices can use — so you choose the country per
// browser or app, and nothing else in the house changes:
//   HTTP proxy   → laptop browser (FoxyProxy / browser proxy settings)
//   Shadowsocks  → phone / tablet / TV apps
// "New server" reconnects to another server in the same country
// (streaming sites sometimes block a VPN server).
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface RegionStatus {
  id: string; name: string; flag: string;
  up: boolean; status: string;
  publicIp: string | null; country: string | null; city: string | null;
  httpProxy: string;
  shadowsocks: { host: string; port: number; cipher: string };
}

const btn: React.CSSProperties = { background: '#333', border: 'none', color: '#ccc', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 };
const code: React.CSSProperties = { fontFamily: 'monospace', background: '#111', color: '#ddd', padding: '2px 6px', borderRadius: 3, fontSize: 12 };

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button style={{ ...btn, padding: '2px 8px', fontSize: 11 }}
      onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500); }).catch(() => {})}>
      {done ? '✓' : 'Copy'}
    </button>
  );
}

export default function RegionsPanel() {
  const [regions, setRegions] = useState<RegionStatus[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/api/mindmap/regions`);
      if (!res.ok) throw new Error(String(res.status));
      setRegions(await res.json());
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

  const newServer = async (r: RegionStatus) => {
    setBusy(r.id);
    try { await fetch(`${API_URL}/api/mindmap/regions/${r.id}/new-server`, { method: 'POST' }); } catch {}
    setTimeout(() => { load(); setBusy(null); }, 6000);
  };

  return (
    <div style={{ color: '#ccc' }}>
      <div style={{ fontSize: 13, color: '#999', marginBottom: 14, lineHeight: 1.5, maxWidth: 760 }}>
        Each region is a VPN connection on HServer. Point a browser or app at a region&apos;s proxy to browse and stream as if you were there —
        local channels and region-only content. Everything else keeps using your normal connection.
        <button onClick={() => setShowHelp(h => !h)} style={{ ...btn, marginLeft: 8, padding: '2px 8px' }}>{showHelp ? 'Hide setup' : 'How to set up devices'}</button>
      </div>

      {showHelp && (
        <div style={{ background: '#252536', border: '1px solid #3a3a4a', borderRadius: 6, padding: 14, marginBottom: 16, fontSize: 13, lineHeight: 1.6, maxWidth: 760 }}>
          <div><b>Laptop browser:</b> install the <i>FoxyProxy</i> extension → Add proxy → type HTTP, the region&apos;s address and port below,
            user <span style={code}>hserver</span> and the <span style={code}>HTTPPROXY_PASSWORD</span> from <span style={code}>vpn.env</span>. Switch region from the extension&apos;s button.</div>
          <div style={{ marginTop: 6 }}><b>Phone / tablet / TV apps:</b> a Shadowsocks app (Shadowrocket on iPhone, v2rayNG on Android) → add server with the
            region&apos;s Shadowsocks host, port and cipher, and the <span style={code}>SHADOWSOCKS_PASSWORD</span> from <span style={code}>vpn.env</span>. Turn it on to watch from that country.</div>
          <div style={{ marginTop: 6, color: '#999' }}>Away from home, turn WireGuard on and use <span style={code}>10.10.0.1</span> instead of the address below (same ports).
            Streaming sites block some VPN servers — if one refuses to play, press <b>New server</b>.</div>
        </div>
      )}

      {error && <div style={{ color: '#ef4444', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      {!regions && !error && <div style={{ color: '#666' }}>Checking regions…</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
        {regions?.map(r => (
          <div key={r.id} style={{ background: '#2a2a3a', border: `1px solid ${r.up ? '#14532d' : '#444'}`, borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 26 }}>{r.flag}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: '#fff', fontWeight: 600 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: r.up ? '#22c55e' : '#f87171' }}>
                  {r.up
                    ? `● Connected${r.city ? ` · ${r.city}` : ''}${r.country ? `, ${r.country}` : ''} · ${r.publicIp}`
                    : r.status === 'unreachable' ? '● Not running (start it on HServer)' : `● ${r.status}`}
                </div>
              </div>
              <button onClick={() => newServer(r)} disabled={busy === r.id || r.status === 'unreachable'} title="Reconnect to another server in the same country"
                style={{ ...btn, opacity: r.status === 'unreachable' ? 0.5 : 1 }}>{busy === r.id ? '…' : '🔄 New server'}</button>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '6px 8px', alignItems: 'center' }}>
              <span style={{ color: '#888' }}>Browser</span><span style={code}>{r.httpProxy}</span><Copy text={r.httpProxy} />
              <span style={{ color: '#888' }}>Apps</span>
              <span style={code}>{r.shadowsocks.host}:{r.shadowsocks.port} · {r.shadowsocks.cipher}</span>
              <Copy text={`${r.shadowsocks.host}:${r.shadowsocks.port}`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}