'use client';

// ============================================================
// 🛡️ AD BLOCKING — Pi-hole on HServer
// ============================================================
// Pi-hole blocks ads/trackers for the devices whose DNS points at
// HServer (you pick them) and for everything on WireGuard.
//   - on / pause for a while
//   - today's numbers + which devices are using it
//   - "something not loading?" → recently blocked → Allow
//   - your own always-block / always-allow domains
//   - blocklists (one-click presets or any link) + update
// ============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
const API = `${API_URL}/api/pihole`;

interface Status {
  reachable: boolean; configured: boolean; error: string | null;
  blocking?: boolean; timer?: number | null;
  queries?: number; blocked?: number; percent?: number; domainsOnLists?: number; listsUpdated?: string | null;
  clients?: { ip: string; name: string; queries: number }[];
  gravity?: { running: boolean; ok: boolean | null; finishedAt: string | null; tail: string };
}
interface Domain { domain: string; type: 'allow' | 'deny'; kind: 'exact' | 'regex'; enabled: boolean; comment: string }
interface List { address: string; enabled: boolean; comment: string; domains: number; updated: string | null; status: number }
interface Preset { address: string; name: string; desc: string; added: boolean }
interface Blocked { domain: string; count: number; last: string; client: string; why: string }

const btn: React.CSSProperties = { background: '#333', border: 'none', color: '#ccc', padding: '5px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 12 };
const card: React.CSSProperties = { background: '#2a2a3a', borderRadius: 8, padding: 14, marginBottom: 14 };
const h3: React.CSSProperties = { color: '#aaa', fontSize: 12, textTransform: 'uppercase', margin: '0 0 10px', letterSpacing: 0.5 };
const input: React.CSSProperties = { background: '#1e1e2e', color: '#fff', border: '1px solid #444', borderRadius: 4, padding: '6px 8px', fontSize: 12 };
const mono: React.CSSProperties = { fontFamily: 'monospace', fontSize: 12 };

const ago = (iso?: string | null) => {
  if (!iso) return 'never';
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} days ago`;
};
const LIST_STATUS: Record<number, string> = { 0: 'not downloaded yet', 1: '', 2: '', 3: 'download failed — using the old copy', 4: 'download failed' };

async function call(path: string, method = 'GET', body?: any) {
  const res = await fetch(`${API}${path}`, {
    method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || `Failed (${res.status})`);
  return data;
}

export default function PiholePanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [blocked, setBlocked] = useState<Blocked[]>([]);
  const [client, setClient] = useState('');
  const [filter, setFilter] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newList, setNewList] = useState('');
  const [listsChanged, setListsChanged] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [busy, setBusy] = useState(false);

  const say = (text: string, error = false) => { setMessage({ text, error }); setTimeout(() => setMessage(null), 5000); };

  const loadStatus = useCallback(async () => {
    try { setStatus(await call('/status')); } catch { setStatus({ reachable: false, configured: false, error: 'Could not reach the backend' }); }
  }, []);
  const loadDetails = useCallback(async () => {
    try {
      const [d, l] = await Promise.all([call('/domains'), call('/lists')]);
      setDomains(d); setLists(l.lists); setPresets(l.presets);
    } catch {}
  }, []);
  const loadBlocked = useCallback(async () => {
    try { setBlocked(await call(`/blocked${client ? `?client=${encodeURIComponent(client)}` : ''}`)); } catch {}
  }, [client]);

  useEffect(() => {
    loadStatus(); loadDetails();
    const t = setInterval(loadStatus, 5000);
    return () => clearInterval(t);
  }, [loadStatus, loadDetails]);
  useEffect(() => { if (status?.reachable) loadBlocked(); }, [status?.reachable, loadBlocked]);
  // When "update lists" finishes, reload the list numbers
  const gravityRunning = !!status?.gravity?.running;
  useEffect(() => { if (!gravityRunning) loadDetails(); }, [gravityRunning, loadDetails]);

  const act = async (fn: () => Promise<any>, ok?: string) => {
    setBusy(true);
    try { await fn(); if (ok) say(ok); } catch (e: any) { say(e?.message || 'Failed', true); }
    setBusy(false);
    loadStatus(); loadDetails();
  };

  const setBlocking = (enabled: boolean, seconds?: number) => act(() => call('/blocking', 'POST', { enabled, seconds }));
  const addDomain = (domain: string, type: 'allow' | 'deny') =>
    act(async () => { await call('/domains', 'POST', { domain, type }); setNewDomain(''); loadBlocked(); },
      type === 'allow' ? `${domain} is allowed now (devices may take a minute to notice).` : `${domain} is blocked now.`);
  const removeDomain = (d: Domain) => act(() => call(`/domains/${d.type}/${d.kind}/${encodeURIComponent(d.domain)}`, 'DELETE'));
  const addList = (address: string) => act(async () => { await call('/lists', 'POST', { address }); setNewList(''); setListsChanged(true); });
  const removeList = (address: string) => act(async () => { await call(`/lists?address=${encodeURIComponent(address)}`, 'DELETE'); setListsChanged(true); });
  const toggleList = (l: List) => act(async () => { await call('/lists', 'PUT', { address: l.address, enabled: !l.enabled }); setListsChanged(true); });
  const updateLists = () => act(async () => { await call('/lists/update', 'POST'); setListsChanged(false); }, 'Downloading the lists… this takes a minute or two.');

  const shownBlocked = useMemo(() => blocked.filter(b => !filter || b.domain.includes(filter.toLowerCase())).slice(0, 40), [blocked, filter]);
  const allowed = new Set(domains.filter(d => d.type === 'allow').map(d => d.domain));

  // ---------------- not ready ----------------
  if (status && !status.reachable) {
    return (
      <div style={{ color: '#ccc', fontSize: 13, lineHeight: 1.6, maxWidth: 760 }}>
        <div style={{ color: '#f87171', marginBottom: 8 }}>⚠ {status.error || 'Pi-hole is not reachable'}</div>
        <div style={{ color: '#999' }}>Check on HServer: <code style={mono}>docker compose ps pihole</code>. The backend needs <code style={mono}>PIHOLE_PASSWORD</code> (or your DB_PASSWORD, which the Pi-hole web page uses) and to be on the Pi-hole network — both are set in docker-compose.override.yml. See configs/remote-access/README.md.</div>
      </div>
    );
  }
  if (!status) return <div style={{ color: '#666' }}>Checking Pi-hole…</div>;

  const on = !!status.blocking;
  return (
    <div style={{ color: '#ccc', maxWidth: 980 }}>
      {/* ON / OFF */}
      <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ color: '#fff', fontWeight: 600 }}>{on ? '🛡️ Blocking ads and trackers' : '⏸ Ad blocking is off'}</div>
          <div style={{ fontSize: 12, color: on ? '#22c55e' : '#f59e0b' }}>
            {on ? 'For the devices that use HServer for DNS, and everything on WireGuard'
              : status.timer ? `Turns back on by itself in ${Math.ceil(status.timer / 60)} min` : 'Stays off until you turn it back on'}
          </div>
        </div>
        {on ? (
          <>
            <span style={{ fontSize: 12, color: '#888' }}>Pause for</span>
            {[[5, '5 min'], [30, '30 min'], [60, '1 hour']].map(([m, label]) => (
              <button key={label} disabled={busy} onClick={() => setBlocking(false, Number(m) * 60)} style={btn}>{label}</button>
            ))}
            <button disabled={busy} onClick={() => setBlocking(false)} style={{ ...btn, color: '#f59e0b' }}>Turn off</button>
          </>
        ) : (
          <button disabled={busy} onClick={() => setBlocking(true)} style={{ ...btn, background: '#22c55e', color: '#fff' }}>Turn back on</button>
        )}
        <button onClick={() => setShowHelp(h => !h)} style={btn}>{showHelp ? 'Hide setup' : 'Add a device'}</button>
      </div>

      {showHelp && (
        <div style={{ ...card, fontSize: 13, lineHeight: 1.7, background: '#252536', border: '1px solid #3a3a4a' }}>
          Point a device&apos;s DNS at <code style={mono}>192.168.4.194</code> (only that one — a second DNS server lets ads through):
          <div><b>Windows:</b> Settings → Network &amp; internet → Wi-Fi → your network → DNS server assignment → Edit → Manual → IPv4 on → Preferred DNS 192.168.4.194.</div>
          <div><b>iPhone / iPad:</b> Settings → Wi-Fi → ⓘ next to your network → Configure DNS → Manual → remove the others, add 192.168.4.194.</div>
          <div><b>Android:</b> Wi-Fi → your network → ✎ → Advanced → IP settings: Static → DNS 1: 192.168.4.194 (leave DNS 2 empty or the same).</div>
          <div><b>Mac:</b> System Settings → Wi-Fi → Details → DNS → replace the list with 192.168.4.194.</div>
          <div style={{ color: '#999', marginTop: 6 }}>Away from home, devices on WireGuard are covered automatically. Ads served from the same address as the video (YouTube, Twitch) can&apos;t be blocked by DNS — use an ad-blocking browser extension for those.</div>
        </div>
      )}

      {/* NUMBERS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 10, marginBottom: 14 }}>
        {[
          ['Lookups (24 h)', (status.queries ?? 0).toLocaleString()],
          ['Blocked', (status.blocked ?? 0).toLocaleString()],
          ['Blocked %', `${status.percent ?? 0}%`],
          ['Domains on lists', (status.domainsOnLists ?? 0) > 0 ? (status.domainsOnLists ?? 0).toLocaleString() : '—'],
        ].map(([label, value]) => (
          <div key={label} style={{ ...card, marginBottom: 0 }}>
            <div style={{ fontSize: 11, color: '#888' }}>{label}</div>
            <div style={{ fontSize: 22, color: '#fff', fontWeight: 600 }}>{value}</div>
          </div>
        ))}
      </div>

      {message && <div style={{ fontSize: 12, marginBottom: 10, color: message.error ? '#ef4444' : '#22c55e' }}>{message.text}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 14 }}>
        {/* LEFT: recently blocked */}
        <div>
          <div style={card}>
            <h3 style={h3}>Something not loading? Recently blocked</h3>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
              <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Filter domains…" style={{ ...input, flex: 1, minWidth: 140 }} />
              <select value={client} onChange={e => setClient(e.target.value)} style={{ ...input, maxWidth: 200 }} title="Only this device">
                <option value="">All devices</option>
                {(status.clients || []).map(c => <option key={c.ip} value={c.ip}>{c.name || c.ip}</option>)}
              </select>
              <button onClick={loadBlocked} style={btn}>↻</button>
            </div>
            {shownBlocked.length === 0 && <div style={{ color: '#666', fontSize: 12, padding: 10 }}>Nothing blocked yet.</div>}
            {shownBlocked.map(b => (
              <div key={b.domain} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #333' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...mono, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.domain}>{b.domain}</div>
                  <div style={{ fontSize: 10, color: '#777' }}>{b.count}× · {ago(b.last)} · {b.client} · by {b.why}</div>
                </div>
                {allowed.has(b.domain)
                  ? <span style={{ fontSize: 11, color: '#22c55e' }}>allowed</span>
                  : <button disabled={busy} onClick={() => addDomain(b.domain, 'allow')} style={{ ...btn, color: '#22c55e' }}>Allow</button>}
              </div>
            ))}
          </div>

          <div style={card}>
            <h3 style={h3}>Devices using Pi-hole (24 h)</h3>
            {(status.clients || []).length === 0 && <div style={{ color: '#666', fontSize: 12 }}>No devices yet — see &quot;Add a device&quot;.</div>}
            {(status.clients || []).map(c => (
              <div key={c.ip} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
                <span>{c.name && c.name !== c.ip ? <>{c.name} <span style={{ color: '#666' }}>{c.ip}</span></> : c.ip}</span>
                <span style={{ color: '#888' }}>{c.queries.toLocaleString()} lookups</span>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: your domains + lists */}
        <div>
          <div style={card}>
            <h3 style={h3}>Your domains</h3>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              <input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="e.g. ads.example.com" style={{ ...input, ...mono, flex: 1 }}
                onKeyDown={e => { if (e.key === 'Enter' && newDomain.trim()) addDomain(newDomain.trim(), 'deny'); }} />
              <button disabled={busy || !newDomain.trim()} onClick={() => addDomain(newDomain.trim(), 'deny')} style={{ ...btn, background: '#7f1d1d', color: '#fff' }}>Block</button>
              <button disabled={busy || !newDomain.trim()} onClick={() => addDomain(newDomain.trim(), 'allow')} style={{ ...btn, background: '#14532d', color: '#fff' }}>Allow</button>
            </div>
            {domains.length === 0 && <div style={{ color: '#666', fontSize: 12 }}>None yet.</div>}
            {domains.map(d => (
              <div key={`${d.type}-${d.kind}-${d.domain}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', borderBottom: '1px solid #333' }}>
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: d.type === 'deny' ? '#ef444422' : '#22c55e22', color: d.type === 'deny' ? '#ef4444' : '#22c55e' }}>
                  {d.type === 'deny' ? 'BLOCK' : 'ALLOW'}
                </span>
                <span style={{ ...mono, flex: 1, color: '#ccc', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.domain}{d.kind === 'regex' ? ' (pattern)' : ''}</span>
                <button disabled={busy} onClick={() => removeDomain(d)} title="Remove" style={{ ...btn, background: 'none', color: '#666' }}>✕</button>
              </div>
            ))}
          </div>

          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 10 }}>
              <h3 style={{ ...h3, margin: 0, flex: 1 }}>Blocklists</h3>
              <button disabled={busy || gravityRunning} onClick={updateLists}
                style={{ ...btn, background: listsChanged ? '#0070f3' : '#333', color: '#fff' }}>
                {gravityRunning ? 'Updating…' : '⟳ Update lists'}
              </button>
            </div>
            {listsChanged && !gravityRunning && <div style={{ fontSize: 12, color: '#f59e0b', marginBottom: 8 }}>Press Update lists to apply your changes.</div>}
            {status.gravity?.finishedAt && !gravityRunning && (
              <div style={{ fontSize: 11, color: status.gravity.ok ? '#22c55e' : '#ef4444', marginBottom: 8 }} title={status.gravity.tail}>
                {status.gravity.ok ? '✓ Lists updated' : '⚠ Updating the lists failed'} {ago(status.gravity.finishedAt)}
              </div>
            )}
            {!status.gravity?.finishedAt && status.listsUpdated && <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>Last updated {ago(status.listsUpdated)} (Pi-hole updates them every week by itself)</div>}

            {presets.map(p => {
              const mine = lists.find(l => l.address === p.address);
              return (
                <div key={p.address} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #333' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: '#eee', fontSize: 13 }}>{p.name}</div>
                    <div style={{ fontSize: 10, color: '#777' }}>
                      {p.desc}{mine && mine.domains > 0 ? ` · ${mine.domains.toLocaleString()} domains` : ''}{mine && LIST_STATUS[mine.status] ? ` · ${LIST_STATUS[mine.status]}` : ''}
                    </div>
                  </div>
                  <div onClick={() => !busy && (mine ? toggleList(mine) : addList(p.address))}
                    title={mine?.enabled ? 'On' : 'Off'}
                    style={{ width: 38, height: 20, borderRadius: 10, cursor: 'pointer', flexShrink: 0, position: 'relative', background: mine?.enabled ? '#22c55e' : '#555' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: mine?.enabled ? 20 : 2, transition: 'left .15s' }} />
                  </div>
                </div>
              );
            })}

            {lists.filter(l => !presets.some(p => p.address === l.address)).map(l => (
              <div key={l.address} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #333' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...mono, color: '#ddd', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.address}>{l.comment && l.comment !== 'Added in HServer' ? l.comment : l.address}</div>
                  <div style={{ fontSize: 10, color: '#777' }}>{l.domains > 0 ? `${l.domains.toLocaleString()} domains` : ''}{LIST_STATUS[l.status] ? ` ${LIST_STATUS[l.status]}` : ''}</div>
                </div>
                <div onClick={() => !busy && toggleList(l)} title={l.enabled ? 'On' : 'Off'}
                  style={{ width: 38, height: 20, borderRadius: 10, cursor: 'pointer', flexShrink: 0, position: 'relative', background: l.enabled ? '#22c55e' : '#555' }}>
                  <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: l.enabled ? 20 : 2 }} />
                </div>
                <button disabled={busy} onClick={() => removeList(l.address)} title="Remove" style={{ ...btn, background: 'none', color: '#666' }}>✕</button>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
              <input value={newList} onChange={e => setNewList(e.target.value)} placeholder="Add a list by its link (https://…)" style={{ ...input, flex: 1 }} />
              <button disabled={busy || !newList.trim()} onClick={() => addList(newList.trim())} style={btn}>Add</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}