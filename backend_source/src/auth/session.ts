// ============================================================
// LOGIN SESSIONS - who is using HServer (Keycloak login)
// ============================================================
// After you log in with Keycloak (the "HServer" sign-in page), the backend
// gives your browser a signed cookie "hs_session": your username + roles
// + when it runs out. Every API call, file (/uploads) and live connection
// checks that cookie. Nobody can fake or edit it without the secret.
//
// Roles (set per user in Keycloak → hserver realm → Users → Role mapping):
//   owner   everything
//   family  can look, can't change anything, no Network pages
//
// Settings (docker-compose.yml → backend_nest):
//   AUTH_MODE              keycloak (default) | off  (off = no login, for the laptop)
//   KEYCLOAK_URL           backend → Keycloak inside Docker (http://keycloak:8080/auth)
//   KEYCLOAK_PUBLIC_URL    browser → Keycloak (http://192.168.4.194:8443/auth)
//   KEYCLOAK_CLIENT_SECRET the hserver-app client's secret (HSERVER_CLIENT_SECRET in .env)
//   APP_URL                where to go after logging in (http://192.168.4.194:5173)
//   CORS_ORIGINS           extra addresses allowed to use the API (comma separated)
// To log everyone out at once: change HSERVER_CLIENT_SECRET in .env (and in Keycloak's client).
// ============================================================

import * as crypto from 'crypto';

export interface SessionUser {
  sub: string;
  username: string;
  name?: string;
  roles: string[];
  exp: number;          // seconds since 1970
}

const env = (k: string, d = '') => (process.env[k] ?? d).trim();
const LAN_IP = env('HSERVER_LAN_IP', '192.168.4.194');

export const AUTH = {
  off: env('AUTH_MODE', 'keycloak').toLowerCase() === 'off',
  internalUrl: env('KEYCLOAK_URL', 'http://keycloak:8080/auth').replace(/\/$/, ''),
  publicUrl: env('KEYCLOAK_PUBLIC_URL', `http://${LAN_IP}:8443/auth`).replace(/\/$/, ''),
  realm: env('KEYCLOAK_REALM', 'hserver'),
  clientId: env('KEYCLOAK_CLIENT_ID', 'hserver-app'),
  clientSecret: env('KEYCLOAK_CLIENT_SECRET'),
  appUrl: env('APP_URL', `http://${LAN_IP}:5173`).replace(/\/$/, ''),
};

export const SESSION_COOKIE = 'hs_session';
export const LOGIN_COOKIE = 'hs_login';
export const OWNER = 'owner';
export const FAMILY = 'family';
export const KNOWN_ROLES = [OWNER, FAMILY];

// The user everyone is when AUTH_MODE=off
export const LOCAL_USER: SessionUser = { sub: 'local', username: 'local', name: 'Local (login off)', roles: [OWNER], exp: 0 };

// Separate keys made from the client secret, so there is nothing extra to keep in .env
const key = (purpose: string) => crypto.createHmac('sha256', AUTH.clientSecret || 'not-set').update(`hserver:${purpose}`).digest();
const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const mac = (purpose: string, data: string) => b64(crypto.createHmac('sha256', key(purpose)).update(data).digest());

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// value.signature — readable, but can't be changed without the secret
export function sign(purpose: string, value: object): string {
  const data = b64(JSON.stringify(value));
  return `${data}.${mac(purpose, data)}`;
}

export function unsign<T = any>(purpose: string, token: string | undefined): T | null {
  if (!token || !AUTH.clientSecret) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig || !safeEqual(sig, mac(purpose, data))) return null;
  try {
    const value = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (typeof value?.exp === 'number' && value.exp * 1000 < Date.now()) return null;   // ran out
    return value as T;
  } catch {
    return null;
  }
}

export function readCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    try { out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); } catch {}
  }
  return out;
}

// Works for Express requests and socket.io handshakes (both have headers.cookie)
export function readSession(req: { headers?: Record<string, any> }): SessionUser | null {
  if (AUTH.off) return LOCAL_USER;
  const user = unsign<SessionUser>('session', readCookies(req.headers?.cookie)[SESSION_COOKIE]);
  return user && Array.isArray(user.roles) ? user : null;
}

export const isOwner = (u: SessionUser | null) => !!u?.roles.includes(OWNER);

// What family accounts can't open (owner-only pages)
const OWNER_ONLY = ['/api/vpn', '/api/pihole', '/api/backups', '/api/services', '/api/mindmap/torrents', '/api/mindmap/regions', '/api/auth/clip-key', '/api/integrations'];

export function allowed(user: SessionUser | null, method: string, path: string): boolean {
  if (!user) return false;
  if (isOwner(user)) return true;
  if (!user.roles.includes(FAMILY)) return false;
  if (OWNER_ONLY.some(p => path === p || path.startsWith(p + '/'))) return false;
  return method === 'GET' || method === 'HEAD';      // family: look, don't change
}

// 📌 "Send to HServer" key: lets the browser button save pages from other sites
// (browsers don't send the login cookie with a form posted from another site)
export function clipKey(username: string) {
  return `${b64(username)}.${mac('clip', username)}`;
}

export function clipKeyUser(k: string | undefined): string | null {
  if (!k || !AUTH.clientSecret) return null;
  const [u] = String(k).split('.');
  try {
    const username = Buffer.from(u, 'base64url').toString('utf8');
    return safeEqual(String(k), clipKey(username)) ? username : null;
  } catch {
    return null;
  }
}

// Addresses allowed to call the API from a browser (any port on these hosts)
const allowedHosts = new Set(
  ['localhost', '127.0.0.1', LAN_IP, '10.10.0.1', ...env('CORS_ORIGINS').split(',')]
    .map(h => h.trim().replace(/^https?:\/\//, '').replace(/[:/].*$/, ''))
    .filter(Boolean),
);
try { allowedHosts.add(new URL(AUTH.appUrl).hostname); } catch {}

export function allowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true;      // not a browser call from another page (curl, Prometheus, same page)
  try {
    const u = new URL(origin);
    return (u.protocol === 'http:' || u.protocol === 'https:') && allowedHosts.has(u.hostname);
  } catch {
    return false;
  }
}

// Cookie text for Set-Cookie
export function cookie(name: string, value: string, opts: { maxAge: number; path?: string; secure?: boolean }) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path || '/'}`,
    `Max-Age=${Math.max(0, Math.floor(opts.maxAge))}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(opts.secure ? ['Secure'] : []),
  ].join('; ');
}