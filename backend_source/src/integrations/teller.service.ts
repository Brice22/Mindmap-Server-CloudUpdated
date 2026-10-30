// ============================================================
// 🏦 TELLER - your bank accounts in 💰 Finance
// ============================================================
// Free "development" tier: real bank data, up to 100 enrollments in total
// (a deleted one is NOT given back). Setup (once):
//   1. Sign up at teller.io → Application ID + a client certificate
//      (certificate.pem + private_key.pem).
//   2. Put both files in /srv/hserverdir-data/secrets/teller/ on HServer.
//   3. .env:  TELLER_APPLICATION_ID=app_…   TELLER_ENV=development
// Then Finance → 🔗 Linked accounts → + Link a bank (Teller's own sign-in
// window). Each sign-in = one enrollment; its access token is stored
// encrypted (vault.ts). Accounts, balances and posted transactions sync
// right away and every day at FINANCE_SYNC_TIME (default 05:30).
// Transactions land in Finance's list (source "teller", never duplicated).
// ============================================================

import { Injectable, Inject, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { DatabaseService } from '../database/database.service';
import { seal, open, localDay } from './vault';

const API = () => (process.env.TELLER_API_URL || 'https://api.teller.io').replace(/\/$/, '');
const CERT = () => process.env.TELLER_CERT_FILE || '/data/secrets/teller/certificate.pem';
const KEY = () => process.env.TELLER_KEY_FILE || '/data/secrets/teller/private_key.pem';
const FIRST_DAYS = 90;   // how far back the first sync reads

@Injectable()
export class TellerService {
  private readonly logger = new Logger(TellerService.name);
  private running = false;

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private certs(): { cert: string; key: string } | null {
    try { return { cert: fs.readFileSync(CERT(), 'utf8'), key: fs.readFileSync(KEY(), 'utf8') }; } catch { return null; }
  }

  config() {
    const env = process.env.TELLER_ENV || 'development';
    const certs = !!this.certs();
    const applicationId = process.env.TELLER_APPLICATION_ID || '';
    return {
      applicationId, environment: env, certificate: certs,
      ready: !!applicationId && (certs || env === 'sandbox'),
      missing: [!applicationId && 'TELLER_APPLICATION_ID in .env', !certs && env !== 'sandbox' && `certificate files (${CERT()}, ${KEY()})`].filter(Boolean),
    };
  }

  // Teller API call: client certificate (mTLS) + the enrollment's token as the Basic-auth user
  private async call(token: string, path: string, method = 'GET') {
    const certs = this.certs();
    const res = await fetch(`${API()}${path}`, {
      method,
      headers: { Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`, Accept: 'application/json' },
      ...(certs ? { tls: { cert: certs.cert, key: certs.key } } : {}),
    } as any);
    if (res.status === 204) return null;
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const msg = data?.error?.message || data?.message || `Teller error ${res.status}`;
      const err: any = new Error(msg); err.status = res.status; err.code = data?.error?.code; throw err;
    }
    return data;
  }

  // ------------------------------------------------------------
  async enroll(b: any) {
    const token = String(b.accessToken || '').trim();
    if (!token) throw new BadRequestException('No access token from Teller Connect');
    const enrollmentId = String(b.enrollmentId || b.enrollment?.id || '').trim() || null;
    const institution = String(b.institution || b.enrollment?.institution?.name || 'Bank').slice(0, 120);
    const existing = enrollmentId
      ? (await this.db.query(`SELECT id FROM fin_links WHERE provider = 'teller' AND external_id = $1`, [enrollmentId])).rows[0]
      : null;
    let linkId: number;
    if (existing) {     // signed in again to the same bank (e.g. after it disconnected) → new token
      await this.db.query(`UPDATE fin_links SET token = $2, status = 'ok', last_error = NULL WHERE id = $1`, [existing.id, seal(token)]);
      linkId = existing.id;
    } else {
      linkId = (await this.db.query(
        `INSERT INTO fin_links (provider, label, institution, external_id, token, status) VALUES ('teller', $1, $1, $2, $3, 'ok') RETURNING id`,
        [institution, enrollmentId, seal(token)])).rows[0].id;
    }
    await this.syncLink(linkId, true);
    return { linkId };
  }

  async unlink(linkId: number, removeTransactions: boolean) {
    const link = (await this.db.query(`SELECT * FROM fin_links WHERE id = $1 AND provider = 'teller'`, [linkId])).rows[0];
    if (!link) throw new NotFoundException('No such linked bank');
    try { await this.call(open(link.token), '/accounts', 'DELETE'); } catch (e: any) { this.logger.warn(`Teller revoke: ${e.message}`); }
    if (removeTransactions) {
      await this.db.query(`DELETE FROM transactions WHERE source = 'teller' AND account_id IN (SELECT id FROM fin_accounts WHERE link_id = $1)`, [linkId]);
    }
    await this.db.query('DELETE FROM fin_links WHERE id = $1', [linkId]);   // its accounts go with it
    return { success: true };
  }

  // "Purchases show as income" on a card → swap income/expense for that account, now and on every later sync
  async flip(accountRowId: number) {
    const acc = (await this.db.query(`UPDATE fin_accounts SET flip = NOT flip WHERE id = $1 AND provider = 'teller' RETURNING id, flip`, [accountRowId])).rows[0];
    if (!acc) throw new NotFoundException('No such account');
    await this.db.query(`UPDATE transactions SET type = CASE WHEN type = 'income' THEN 'expense' ELSE 'income' END
                         WHERE source = 'teller' AND account_id = $1`, [accountRowId]);
    return { flip: acc.flip };
  }

  // ------------------------------------------------------------
  async syncAll() {
    if (this.running) return { skipped: true };
    this.running = true;
    try {
      const links = (await this.db.query(`SELECT id FROM fin_links WHERE provider = 'teller'`)).rows;
      for (const l of links) await this.syncLink(l.id, false);
      return { links: links.length };
    } finally { this.running = false; }
  }

  async syncLink(linkId: number, firstTime: boolean) {
    const link = (await this.db.query('SELECT * FROM fin_links WHERE id = $1', [linkId])).rows[0];
    if (!link) return;
    let added = 0;
    try {
      const token = open(link.token);
      const accounts: any[] = (await this.call(token, '/accounts')) || [];
      for (const a of accounts) {
        const acc = (await this.db.query(
          `INSERT INTO fin_accounts (link_id, provider, external_id, name, institution, type, subtype, last_four, currency, status, raw)
           VALUES ($1, 'teller', $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
           ON CONFLICT (provider, external_id) DO UPDATE SET link_id = EXCLUDED.link_id, name = EXCLUDED.name, institution = EXCLUDED.institution,
             type = EXCLUDED.type, subtype = EXCLUDED.subtype, last_four = EXCLUDED.last_four, currency = EXCLUDED.currency,
             status = EXCLUDED.status, raw = EXCLUDED.raw
           RETURNING id, flip`,
          [linkId, a.id, a.name || 'Account', a.institution?.name || link.institution, a.type || null, a.subtype || null,
           a.last_four || null, a.currency || 'USD', a.status || 'open', JSON.stringify(a)])).rows[0];
        if (a.status === 'closed') continue;
        try {
          const bal = await this.call(token, `/accounts/${encodeURIComponent(a.id)}/balances`);
          await this.db.query('UPDATE fin_accounts SET balance_ledger = $2, balance_available = $3, balance_at = NOW() WHERE id = $1',
            [acc.id, bal?.ledger != null ? Number(bal.ledger) : null, bal?.available != null ? Number(bal.available) : null]);
        } catch (e: any) { this.logger.warn(`Balance ${a.id}: ${e.message}`); }
        added += await this.syncTransactions(token, acc.id, a.id, firstTime, acc.flip);
      }
      await this.db.query(`UPDATE fin_links SET status = 'ok', last_error = NULL, last_sync = NOW() WHERE id = $1`, [linkId]);
    } catch (e: any) {
      const state = e.status === 401 || e.status === 403 || /enrollment|disconnect/i.test(String(e.code || '')) ? 'reconnect' : 'error';
      await this.db.query('UPDATE fin_links SET status = $2, last_error = $3, last_sync = NOW() WHERE id = $1', [linkId, state, String(e.message).slice(0, 500)]);
      this.logger.warn(`Teller link ${linkId}: ${e.message}`);
    }
    return { added };
  }

  // Posted transactions → Finance (pending ones wait until they post)
  // flip = this account's bank reports money out as positive (some credit cards): swap income/expense
  private async syncTransactions(token: string, accountRowId: number, accountId: string, firstTime: boolean, flip = false) {
    const since = new Date(); since.setDate(since.getDate() - (firstTime ? FIRST_DAYS : 10));
    const stop = localDay(since);
    let fromId: string | null = null, added = 0;
    for (let page = 0; page < (firstTime ? 20 : 2); page++) {
      const q = new URLSearchParams({ count: '250' });
      if (fromId) q.set('from_id', fromId);
      const txs: any[] = (await this.call(token, `/accounts/${encodeURIComponent(accountId)}/transactions?${q}`)) || [];
      if (!txs.length) break;
      for (const t of txs) {
        if (t.status && t.status !== 'posted') continue;
        const amount = Number(t.amount);
        if (!Number.isFinite(amount) || !t.id || !t.date) continue;
        const name = String(t.details?.counterparty?.name || t.description || 'Transaction').slice(0, 200);
        const category = String(t.details?.category || 'Other').replace(/_/g, ' ').replace(/^\w/, (c: string) => c.toUpperCase()).slice(0, 60);
        const r = await this.db.query(
          `INSERT INTO transactions (name, amount, category, date, type, source, external_id, account_id)
           VALUES ($1, $2, $3, $4, $5, 'teller', $6, $7)
           ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO NOTHING`,
          [name, Math.abs(amount), category, String(t.date).slice(0, 10), (amount < 0) !== flip ? 'expense' : 'income', t.id, accountRowId]);
        added += r.rowCount || 0;
      }
      const oldest = txs[txs.length - 1];
      if (String(oldest.date) < stop) break;
      fromId = oldest.id;
    }
    return added;
  }
}