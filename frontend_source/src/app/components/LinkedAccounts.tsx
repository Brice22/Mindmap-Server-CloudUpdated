'use client';

// ============================================================
// 🔗 LINKED ACCOUNTS - banks (Teller) and Webull in 💰 Finance
// ============================================================
// + Link a bank opens Teller's own sign-in window (your bank password goes
// to Teller, never to HServer). Accounts, balances and posted transactions
// come in right away and every morning; "Sync now" any time.
// Webull: Connect, approve it in the Webull app if asked, then Check.
// Positions show in Investments (source Webull) and replace themselves on
// every sync; manual entries are never touched.
// ============================================================

import React, { useCallback, useEffect, useState } from 'react';

interface Props { apiUrl: string; onClose: () => void; onChanged: () => void }

const overlay: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 };
const box: React.CSSProperties = { background: '#2a2a3a', padding: 20, borderRadius: 8, width: 640, maxWidth: '95vw', maxHeight: '90vh', overflow: 'auto', border: '1px solid #444', color: '#ccc', fontSize: 13 };
const btn: React.CSSProperties = { border: 'none', padding: '6px 12px', borderRadius: 5, cursor: 'pointer', fontSize: 12 };
const card: React.CSSProperties = { background: '#1e1e2e', borderRadius: 6, padding: '10px 12px', marginBottom: 10 };
const money = (v: any) => (v == null ? '—' : `$${Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const ago = (t: string | null) => {
  if (!t) return 'never';
  const m = Math.round((Date.now() - Date.parse(t)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : new Date(t).toLocaleDateString();
};
const STATUS: Record<string, [string, string]> = {
  ok: ['✓ Connected', '#4ade80'], pending: ['⏳ Waiting for approval', '#facc15'],
  reconnect: ['⚠ Sign in again', '#f87171'], error: ['⚠ Error', '#f87171'],
};

declare global { interface Window { TellerConnect?: any } }
function loadTeller(): Promise<any> {
  if (window.TellerConnect) return Promise.resolve(window.TellerConnect);
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.teller.io/connect/connect.js';
    s.onload = () => (window.TellerConnect ? resolve(window.TellerConnect) : reject(new Error('Teller Connect did not load')));
    s.onerror = () => reject(new Error('Could not reach cdn.teller.io (is this computer online?)'));
    document.head.appendChild(s);
  });
}

export default function LinkedAccounts({ apiUrl, onClose, onChanged }: Props) {
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const call = useCallback(async (path: string, method = 'GET', body?: any) => {
    const r = await fetch(`${apiUrl}/api/integrations${path}`, {
      method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || `Failed (${r.status})`);
    return j;
  }, [apiUrl]);

  const load = useCallback(async () => {
    try { setD(await call('/finance')); } catch (e: any) { setError(e.message); }
  }, [call]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = async (label: string, fn: () => Promise<any>, done?: string) => {
    setBusy(label); setError(''); setMsg('');
    try { await fn(); if (done) setMsg(done); await load(); onChanged(); } catch (e: any) { setError(e.message); }
    setBusy('');
  };

  // Teller's sign-in window; enrollmentId = repair a bank that needs signing in again
  const linkBank = async (enrollmentId?: string) => {
    setError(''); setMsg('');
    try {
      const TC = await loadTeller();
      const tc = TC.setup({
        applicationId: d.teller.applicationId,
        environment: d.teller.environment,
        products: ['balance', 'transactions'],
        ...(enrollmentId ? { enrollmentId } : {}),
        onSuccess: (en: any) => run('link', () => call('/finance/teller/enroll', 'POST', {
          accessToken: en.accessToken, enrollmentId: en.enrollment?.id, institution: en.enrollment?.institution?.name,
        }), `${en.enrollment?.institution?.name || 'Bank'} linked — transactions are in Finance`),
        onExit: () => {},
      });
      tc.open();
    } catch (e: any) { setError(e.message); }
  };

  const unlinkBank = (l: any) => {
    if (!confirm(`Unlink ${l.institution}? HServer stops reading it.`)) return;
    const removeTx = confirm(`Also delete the transactions that came from ${l.institution}?\nOK = delete them · Cancel = keep them`);
    run('unlink', () => call(`/finance/teller/${l.id}${removeTx ? '?removeTransactions=1' : ''}`, 'DELETE'), `${l.institution} unlinked`);
  };

  const unlinkWebull = () => {
    if (!confirm('Disconnect Webull?')) return;
    const rm = confirm('Also remove the Webull positions from Investments?\nOK = remove · Cancel = keep');
    run('webull', () => call(`/finance/webull${rm ? '?removeInvestments=1' : ''}`, 'DELETE'), 'Webull disconnected');
  };

  if (!d) {
    return (
      <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={box}>{error ? <span style={{ color: '#f87171' }}>{error}</span> : 'Loading…'}</div>
      </div>
    );
  }

  const banks = d.links.filter((l: any) => l.provider === 'teller');
  const accountsOf = (id: number) => d.accounts.filter((a: any) => a.link_id === id);
  const wb = d.webull;
  const wbAccounts = d.accounts.filter((a: any) => a.provider === 'webull');

  return (
    <div style={overlay} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={box} role="dialog" aria-label="Linked accounts">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ color: '#fff', margin: 0 }}>🔗 Linked accounts</h3>
          <button onClick={() => run('sync', () => call('/finance/sync', 'POST'), 'Synced')} disabled={!!busy}
            style={{ ...btn, background: '#333', color: '#ccc' }}>{busy === 'sync' ? 'Syncing…' : '🔄 Sync now'}</button>
        </div>
        {msg && <div style={{ color: '#4ade80', marginBottom: 8 }}>{msg}</div>}
        {error && <div style={{ color: '#f87171', marginBottom: 8 }}>{error}</div>}

        {/* 🏦 Banks */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0' }}>
          <div style={{ color: '#fff', fontWeight: 600 }}>🏦 Banks & cards <span style={{ color: '#666', fontWeight: 400 }}>(Teller)</span></div>
          <button onClick={() => linkBank()} disabled={!d.teller.ready || !!busy}
            style={{ ...btn, background: d.teller.ready ? '#0070f3' : '#333', color: d.teller.ready ? '#fff' : '#777' }}>
            {busy === 'link' ? 'Linking…' : '+ Link a bank'}
          </button>
        </div>
        {!d.teller.ready && (
          <div style={{ ...card, color: '#facc15' }}>Not set up yet — missing: {d.teller.missing.join(', ')}. See the setup steps in the guide.</div>
        )}
        {banks.length === 0 && d.teller.ready && <div style={{ ...card, color: '#888' }}>No banks linked yet.</div>}
        {banks.map((l: any) => {
          const [label, color] = STATUS[l.status] || [l.status, '#ccc'];
          return (
            <div key={l.id} style={card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <div>
                  <b style={{ color: '#fff' }}>{l.institution}</b>
                  <span style={{ color, marginLeft: 8, fontSize: 12 }}>{label}</span>
                  <span style={{ color: '#666', marginLeft: 8, fontSize: 12 }}>synced {ago(l.last_sync)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {l.status === 'reconnect' && (
                    <button onClick={() => linkBank(l.external_id || undefined)} style={{ ...btn, background: '#0070f3', color: '#fff' }}>Sign in again</button>
                  )}
                  <button onClick={() => unlinkBank(l)} disabled={!!busy} style={{ ...btn, background: '#333', color: '#ccc' }}>Unlink</button>
                </div>
              </div>
              {l.last_error && l.status !== 'ok' && <div style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{l.last_error}</div>}
              {accountsOf(l.id).map((a: any) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderTop: '1px solid #2f2f40', marginTop: 5 }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ color: '#ddd' }}>{a.name}</span>
                    <span style={{ color: '#666', marginLeft: 6, fontSize: 12 }}>{a.subtype || a.type}{a.last_four ? ` ••${a.last_four}` : ''}{a.status === 'closed' ? ' · closed' : ''}</span>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12 }}>
                    <div style={{ color: '#fff' }}>{money(a.balance_ledger)}</div>
                    <div style={{ color: '#666' }}>{a.type === 'credit' ? 'owed' : 'balance'}{a.balance_available != null ? ` · ${money(a.balance_available)} available` : ''}</div>
                  </div>
                  {a.type === 'credit' && (
                    <button onClick={() => run('flip', () => call(`/finance/accounts/${a.id}/flip`, 'POST'), `${a.name}: income/expense swapped`)}
                      title="If this card's purchases show as income, press once (it remembers)"
                      style={{ ...btn, background: a.flip ? '#4b3b10' : '#333', color: '#ccc' }}>↕ {a.flip ? 'Flipped' : 'Flip'}</button>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {/* 📈 Webull */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 6px' }}>
          <div style={{ color: '#fff', fontWeight: 600 }}>📈 Webull</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {wb.linked && wb.status === 'pending' && (
              <button onClick={() => run('webull', () => call('/finance/webull/check', 'POST'), 'Checked')} disabled={!!busy}
                style={{ ...btn, background: '#0070f3', color: '#fff' }}>I approved it — Check</button>
            )}
            <button onClick={() => run('webull', () => call('/finance/webull/connect', 'POST'))} disabled={!wb.ready || !!busy}
              style={{ ...btn, background: wb.ready && !wb.linked ? '#0070f3' : '#333', color: wb.ready ? (wb.linked ? '#ccc' : '#fff') : '#777' }}>
              {busy === 'webull' ? 'Working…' : wb.linked ? 'Reconnect' : 'Connect'}
            </button>
            {wb.linked && <button onClick={unlinkWebull} disabled={!!busy} style={{ ...btn, background: '#333', color: '#ccc' }}>Disconnect</button>}
          </div>
        </div>
        {!wb.ready && <div style={{ ...card, color: '#facc15' }}>Not set up yet — missing: {wb.missing.join(', ')}. See the setup steps in the guide.</div>}
        {wb.ready && !wb.linked && <div style={{ ...card, color: '#888' }}>Not connected yet.</div>}
        {wb.linked && (
          <div style={card}>
            <span style={{ color: (STATUS[wb.status] || ['', '#ccc'])[1] }}>{(STATUS[wb.status] || [wb.status])[0]}</span>
            <span style={{ color: '#666', marginLeft: 8, fontSize: 12 }}>synced {ago(wb.lastSync)}</span>
            {wb.status === 'pending' && (
              <div style={{ marginTop: 6, lineHeight: 1.5 }}>
                Open the <b>Webull app</b> → Menu → Messages → <b>OpenAPI Notifications</b> → Check Now, enter the SMS code
                (within 5 minutes), then press <b>Check</b> here. Too late? Press Reconnect for a fresh request.
              </div>
            )}
            {wb.lastError && wb.status !== 'ok' && <div style={{ color: '#f87171', fontSize: 12, marginTop: 4 }}>{wb.lastError}</div>}
            {wbAccounts.map((a: any) => (
              <div key={a.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderTop: '1px solid #2f2f40', marginTop: 5 }}>
                <span style={{ color: '#ddd' }}>{a.name}</span>
                <span style={{ fontSize: 12 }}><span style={{ color: '#fff' }}>{money(a.balance_ledger)}</span><span style={{ color: '#666' }}> total · {money(a.balance_available)} cash</span></span>
              </div>
            ))}
          </div>
        )}

        <div style={{ color: '#666', fontSize: 12, margin: '12px 0' }}>
          Syncs by itself every morning. Bank transactions: only posted ones (pending ones arrive when they post); 90 days back on the first link.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ ...btn, background: '#333', color: '#ccc', padding: '7px 14px', fontSize: 13 }}>Close</button>
        </div>
      </div>
    </div>
  );
}