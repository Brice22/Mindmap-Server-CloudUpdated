// ============================================================
// 📈 WEBULL - balances and positions in 💰 Finance → Investments
// ============================================================
// Official Webull OpenAPI (read-only use here: no orders are ever placed).
// Setup (once):
//   1. webull.com → avatar → Developer Tool → OpenAPI Management → apply
//      (Webull reviews it, about 1–2 working days)
//   2. API Keys Management → Generate Key → App Key + App Secret
//   3. .env:  WEBULL_APP_KEY=…   WEBULL_APP_SECRET=…
// Then Finance → 🔗 Linked accounts → Webull → Connect. If your Webull account
// uses 2-step verification, Webull asks you to approve the connection in the
// Webull app (Menu → Messages → OpenAPI Notifications → Check Now, enter the
// SMS code) within 5 minutes. The token stays valid while it's used at least
// every 15 days — the daily sync keeps it alive.
//
// Requests are signed like Webull's own SDK (webull-openapi-python-sdk):
// HMAC-SHA256 over path + sorted signing headers/query + SHA-256 of the body.
// ============================================================

import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { seal, open, localDay } from './vault';

const HOST = () => process.env.WEBULL_API_HOST || 'api.webull.com';
const SCHEME = () => process.env.WEBULL_API_SCHEME || 'https';

// Python's quote(s, safe=''): everything except letters, digits and - . _ ~ becomes %XX
export const pyQuote = (s: string) =>
  encodeURIComponent(s).replace(/[!'()*]/g, c => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

// The string to sign and the signature (exported so it can be checked against Webull's worked example)
export function webullSignature(opts: {
  path: string; query?: Record<string, string>; body?: string | null; host: string;
  appKey: string; appSecret: string; timestamp: string; nonce: string; algorithm?: 'HMAC-SHA256' | 'HMAC-SHA1';
}) {
  const algorithm = opts.algorithm || 'HMAC-SHA256';
  const params: Record<string, string> = {
    'x-app-key': opts.appKey,
    'x-timestamp': opts.timestamp,
    'x-signature-version': '1.0',
    'x-signature-algorithm': algorithm,
    'x-signature-nonce': opts.nonce,
    host: opts.host,
  };
  for (const [k, v] of Object.entries(opts.query || {})) params[k] = params[k] !== undefined ? `${params[k]}&${v}` : String(v);
  const sorted = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
  let toSign = `${opts.path}&${sorted}`;
  if (opts.body != null) {
    const digest = algorithm === 'HMAC-SHA256' ? crypto.createHash('sha256') : crypto.createHash('md5');
    toSign += `&${digest.update(opts.body, 'utf8').digest('hex').toUpperCase()}`;
  }
  const signature = crypto.createHmac(algorithm === 'HMAC-SHA256' ? 'sha256' : 'sha1', `${opts.appSecret}&`)
    .update(pyQuote(toSign)).digest('base64');
  return { signature, algorithm };
}

const pick = (o: any, ...keys: string[]) => { for (const k of keys) if (o?.[k] != null && o[k] !== '') return o[k]; return null; };
const list = (d: any): any[] => (Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : Array.isArray(d?.holdings) ? d.holdings
  : Array.isArray(d?.positions) ? d.positions : Array.isArray(d?.accounts) ? d.accounts : Array.isArray(d?.data?.holdings) ? d.data.holdings : []);

@Injectable()
export class WebullService {
  private readonly logger = new Logger(WebullService.name);
  private running = false;

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  config() {
    const ready = !!process.env.WEBULL_APP_KEY && !!process.env.WEBULL_APP_SECRET;
    return { ready, host: HOST(), missing: ready ? [] : ['WEBULL_APP_KEY and WEBULL_APP_SECRET in .env'] };
  }

  private async link() {
    return (await this.db.query(`SELECT *, last_sync::timestamptz AS last_sync FROM fin_links WHERE provider = 'webull' ORDER BY id LIMIT 1`)).rows[0] || null;
  }

  private async request(method: 'GET' | 'POST', path: string, query: Record<string, string> = {}, body?: any, token?: string | null) {
    const appKey = process.env.WEBULL_APP_KEY || '', appSecret = process.env.WEBULL_APP_SECRET || '';
    if (!appKey || !appSecret) throw new BadRequestException('Add WEBULL_APP_KEY and WEBULL_APP_SECRET to .env first');
    const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
    const nonce = crypto.randomUUID();
    const bodyText = body === undefined ? null : JSON.stringify(body);
    const { signature, algorithm } = webullSignature({ path, query, body: bodyText, host: HOST(), appKey, appSecret, timestamp, nonce });
    const headers: Record<string, string> = {
      'x-app-key': appKey, 'x-timestamp': timestamp, 'x-signature-version': '1.0', 'x-signature-algorithm': algorithm,
      'x-signature-nonce': nonce, 'x-signature': signature, 'x-version': 'v3', Accept: 'application/json',
    };
    if (token) headers['x-access-token'] = token;
    if (bodyText != null) headers['Content-Type'] = 'application/json';
    const qs = new URLSearchParams(query).toString();
    const res = await fetch(`${SCHEME()}://${HOST()}${path}${qs ? `?${qs}` : ''}`, { method, headers, body: bodyText ?? undefined });
    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    if (!res.ok) {
      const err: any = new Error(data?.message || data?.msg || data?.error_msg || `Webull error ${res.status}`);
      err.status = res.status; throw err;
    }
    return data;
  }

  // ------------------------------------------------------------
  // Connect: make (or renew) the access token. PENDING = approve it in the Webull app.
  async connect() {
    const existing = await this.link();
    const old = existing?.token ? (() => { try { return open(existing.token); } catch { return null; } })() : null;
    // Renew the old token if there is one; if Webull refuses it (expired), start fresh
    const t = old
      ? await this.request('POST', '/auth/tokens/create', {}, { token: old }).catch(() => this.request('POST', '/auth/tokens/create', {}, {}))
      : await this.request('POST', '/auth/tokens/create', {}, {});
    if (!t?.token) throw new BadRequestException('Webull did not return a token');
    await this.saveToken(existing?.id, t);
    if (t.status === 'NORMAL') await this.sync();
    return this.state();
  }

  // Ask Webull whether you've approved it yet
  async check() {
    const l = await this.link();
    if (!l?.token) throw new BadRequestException('Press Connect first');
    const t = await this.request('POST', '/auth/tokens/check', {}, { token: open(l.token) });
    await this.saveToken(l.id, { ...t, token: t?.token || open(l.token) });
    if (t?.status === 'NORMAL') await this.sync();
    return this.state();
  }

  private async saveToken(id: number | undefined, t: any) {
    const status = String(t.status || 'PENDING');
    const data = JSON.stringify({ tokenStatus: status, expires: t.expires || null });
    if (id) {
      await this.db.query(`UPDATE fin_links SET token = $2, status = $3, data = $4::jsonb, last_error = NULL WHERE id = $1`,
        [id, seal(String(t.token)), status === 'NORMAL' ? 'ok' : 'pending', data]);
    } else {
      await this.db.query(`INSERT INTO fin_links (provider, label, institution, token, status, data) VALUES ('webull', 'Webull', 'Webull', $1, $2, $3::jsonb)`,
        [seal(String(t.token)), status === 'NORMAL' ? 'ok' : 'pending', data]);
    }
  }

  async state() {
    const l = await this.link();
    return { ...this.config(), linked: !!l, status: l?.status || 'none', tokenStatus: l?.data?.tokenStatus || null, lastSync: l?.last_sync || null, lastError: l?.last_error || null };
  }

  async unlink(removeInvestments: boolean) {
    const l = await this.link();
    if (!l) return { success: true };
    if (removeInvestments) await this.db.query(`DELETE FROM investments WHERE source = 'webull'`);
    await this.db.query('DELETE FROM fin_links WHERE id = $1', [l.id]);
    return { success: true };
  }

  // ------------------------------------------------------------
  // Accounts → balances → positions (positions replace the previous Webull rows)
  async sync() {
    if (this.running) return { skipped: true };
    const l = await this.link();
    if (!l?.token || l.status === 'pending') return { skipped: true };
    this.running = true;
    try {
      const token = open(l.token);
      const accounts = list(await this.request('GET', '/trading/accounts/list', {}, undefined, token));
      let positions = 0;
      for (const a of accounts) {
        const accountId = String(pick(a, 'account_id', 'accountId', 'id') || '');
        if (!accountId) continue;
        const name = String(pick(a, 'account_label', 'account_name', 'nickname', 'account_type', 'accountType') || 'Webull account');
        const bal = await this.request('GET', '/trading/assets/balances/get', { account_id: accountId }, undefined, token).catch((e: any) => {
          this.logger.warn(`Webull balance: ${e.message}`); return null;
        });
        const b = bal?.data && !Array.isArray(bal.data) ? bal.data : bal || {};
        const total = pick(b, 'total_asset', 'total_asset_value', 'total_assets', 'net_liquidation', 'total_net_liquidation_value', 'totalAsset');
        const cash = pick(b, 'cash_balance', 'total_cash_value', 'cash', 'settled_cash', 'cashBalance');
        const acc = (await this.db.query(
          `INSERT INTO fin_accounts (link_id, provider, external_id, name, institution, type, subtype, currency, balance_ledger, balance_available, balance_at, raw)
           VALUES ($1, 'webull', $2, $3, 'Webull', 'investment', $4, $5, $6, $7, NOW(), $8::jsonb)
           ON CONFLICT (provider, external_id) DO UPDATE SET link_id = EXCLUDED.link_id, name = EXCLUDED.name, subtype = EXCLUDED.subtype,
             currency = EXCLUDED.currency, balance_ledger = EXCLUDED.balance_ledger, balance_available = EXCLUDED.balance_available,
             balance_at = NOW(), raw = EXCLUDED.raw
           RETURNING id`,
          [l.id, accountId, name, String(pick(a, 'account_type', 'accountType') || ''), String(pick(b, 'currency', 'total_asset_currency') || 'USD'),
           total != null ? Number(total) : null, cash != null ? Number(cash) : null, JSON.stringify({ account: a, balance: bal })])).rows[0];

        const pos = list(await this.request('GET', '/trading/assets/positions/list', { account_id: accountId }, undefined, token));
        const keep: string[] = [];
        for (const p of pos) {
          const symbol = String(pick(p, 'symbol', 'ticker', 'disSymbol', 'instrument_symbol', 'short_name') || '').toUpperCase();
          if (!symbol) continue;
          const qty = Number(pick(p, 'qty', 'quantity', 'position', 'shares') || 0);
          const cost = Number(pick(p, 'unit_cost', 'cost_price', 'avg_cost', 'average_cost', 'costPrice') || 0);
          const last = Number(pick(p, 'last_price', 'market_price', 'price', 'lastPrice') || 0);
          const value = pick(p, 'market_value', 'marketValue');
          const kind = String(pick(p, 'instrument_type', 'asset_type', 'security_type') || 'stock').toLowerCase();
          const ext = `${accountId}:${pick(p, 'instrument_id', 'id') || symbol}`;
          keep.push(ext);
          await this.db.query(
            `INSERT INTO investments (symbol, shares, buy_price, current_price, source, type, date, external_id, account_name, market_value, raw)
             VALUES ($1, $2, $3, $4, 'webull', $5, $6, $7, $8, $9, $10::jsonb)
             ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL DO UPDATE SET symbol = EXCLUDED.symbol, shares = EXCLUDED.shares,
               buy_price = EXCLUDED.buy_price, current_price = EXCLUDED.current_price, type = EXCLUDED.type, date = EXCLUDED.date,
               account_name = EXCLUDED.account_name, market_value = EXCLUDED.market_value, raw = EXCLUDED.raw`,
            [symbol, qty, cost, last, kind.includes('option') ? 'option' : kind.includes('crypto') ? 'crypto' : kind.includes('etf') ? 'etf' : 'stock',
             localDay(), ext, name, value != null ? Number(value) : null, JSON.stringify(p)]);
          positions++;
        }
        // Sold since the last sync → gone
        await this.db.query(`DELETE FROM investments WHERE source = 'webull' AND external_id LIKE $1 AND NOT (external_id = ANY($2::text[]))`,
          [`${accountId}:%`, keep]);
        void acc;
      }
      await this.db.query(`UPDATE fin_links SET status = 'ok', last_error = NULL, last_sync = NOW() WHERE id = $1`, [l.id]);
      return { accounts: accounts.length, positions };
    } catch (e: any) {
      const state = e.status === 401 || e.status === 403 ? 'reconnect' : 'error';
      await this.db.query('UPDATE fin_links SET status = $2, last_error = $3, last_sync = NOW() WHERE id = $1', [l.id, state, String(e.message).slice(0, 500)]);
      this.logger.warn(`Webull sync: ${e.message}`);
      return { error: e.message };
    } finally { this.running = false; }
  }
}