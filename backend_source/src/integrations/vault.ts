// ============================================================
// 🔐 VAULT - keeps bank / broker / watch tokens encrypted in Postgres
// ============================================================
// AES-256-GCM with a key made from INTEGRATIONS_KEY (or, if that isn't set,
// DB_PASSWORD). A database dump or backup alone can't read the tokens.
// If the key changes, stored tokens can't be read any more: link the
// accounts again (Finance → 🔗 Linked accounts).
// ============================================================

import * as crypto from 'crypto';

function key() {
  const base = process.env.INTEGRATIONS_KEY || process.env.DB_PASSWORD || '';
  if (!base) throw new Error('Set INTEGRATIONS_KEY (or DB_PASSWORD) in .env to store linked-account tokens');
  return crypto.createHash('sha256').update(`hserver:integrations:${base}`).digest();
}

// "v1.iv.tag.data" (base64url parts)
export function seal(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function open(sealed: string): string {
  const [v, iv, tag, data] = String(sealed || '').split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Not a sealed value');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}

// Next time HH:MM (local, the container's TZ) comes round, in ms from now
export function msUntil(hhmm: string, fallback = '05:30') {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || fallback).trim()) || /^(\d{1,2}):(\d{2})$/.exec(fallback)!;
  const now = new Date();
  const next = new Date(now);
  next.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

// Local YYYY-MM-DD
export const localDay = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;