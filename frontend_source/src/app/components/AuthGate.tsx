'use client';

// ============================================================
// LOGIN GATE - the app only opens once you're logged in
// ============================================================
// - First visit (or after logging out): goes straight to the HServer
//   sign-in page (Keycloak), then back to the page you were on
// - Every call to the backend sends the login cookie (credentials: 'include')
// - If the login runs out while you're working, a box asks you to log in
//   again instead of throwing you out mid-edit
// - getUser() / isOwner() tell other parts of the app who is logged in
// ============================================================

import React, { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface HServerUser { username: string; name?: string; roles: string[] }

let currentUser: HServerUser | null = null;
export const getUser = () => currentUser;
export const isOwner = () => !!currentUser?.roles.includes('owner');

export const loginUrl = () => `${API_URL}/api/auth/login?return=${encodeURIComponent(window.location.href)}`;
export const logoutUrl = () => `${API_URL}/api/auth/logout?return=${encodeURIComponent(window.location.origin + '/')}`;

// Runs once, as soon as the app loads in the browser (before any panel asks the backend for data)
if (typeof window !== 'undefined' && !(window as any).__hserverFetch) {
  (window as any).__hserverFetch = true;
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const toApi = url.startsWith(API_URL) || url.startsWith('/api/');
    const res = await original(input, toApi ? { ...init, credentials: 'include' } : init);
    if (toApi && res.status === 401 && !url.includes('/api/auth/')) window.dispatchEvent(new Event('hserver-logged-out'));
    return res;
  };
}

const box: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'rgba(15,15,25,0.92)', color: '#ddd', font: '15px/1.6 system-ui, sans-serif',
};
const card: React.CSSProperties = { background: '#1e1e2e', border: '1px solid #444', borderRadius: 8, padding: 24, maxWidth: 420, textAlign: 'center' };
const button: React.CSSProperties = { background: '#0070f3', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 16px', fontSize: 14, cursor: 'pointer', margin: '12px 6px 0' };

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<'checking' | 'ok' | 'error' | 'offline'>('checking');
  const [message, setMessage] = useState('');
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${API_URL}/api/auth/me`, { cache: 'no-store' });
        if (r.status === 401) { window.location.href = loginUrl(); return; }
        const data = await r.json().catch(() => ({}));
        if (!r.ok) { setMessage(data.message || `The backend answered ${r.status}`); setState('error'); return; }
        currentUser = data.user;
        setState('ok');
      } catch {
        setMessage(`Can't reach the HServer backend (${API_URL}).`);
        setState('error');
      }
    };
    check();
    const onOut = () => setExpired(true);
    window.addEventListener('hserver-logged-out', onOut);
    return () => window.removeEventListener('hserver-logged-out', onOut);
  }, []);

  if (state === 'checking') return <div style={box}>Checking your login…</div>;
  if (state === 'error') {
    return (
      <div style={box}><div style={card}>
        <div style={{ fontSize: 18, color: '#fff', marginBottom: 8 }}>HServer isn't ready</div>
        <div>{message}</div>
        <button style={button} onClick={() => window.location.reload()}>Try again</button>
        <button style={{ ...button, background: '#333' }} onClick={() => setState('offline')}>Open anyway</button>
      </div></div>
    );
  }

  return (
    <>
      {children}
      {expired && (
        <div style={box}><div style={card}>
          <div style={{ fontSize: 18, color: '#fff', marginBottom: 8 }}>Your login ran out</div>
          <div>Log in again to keep saving. Anything that didn't save will need redoing.</div>
          <button style={button} onClick={() => { window.location.href = loginUrl(); }}>Log in again</button>
          <button style={{ ...button, background: '#333' }} onClick={() => setExpired(false)}>Close</button>
        </div></div>
      )}
    </>
  );
}