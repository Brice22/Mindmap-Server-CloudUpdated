// ============================================================
// PI-HOLE SERVICE - ad & tracker blocking (Pi-hole v6 REST API)
// ============================================================
// Pi-hole answers DNS for the devices you point at it (and for
// everything on WireGuard). This service is how the app talks to it:
// on/off (or off for N minutes), stats, blocklists, your own
// block/allow domains, recently blocked domains (to fix a site
// that broke) and "update lists" (gravity).
// Pi-hole v6 uses sessions: log in once with the web password,
// reuse the session id, log in again when it expires.
// Settings: PIHOLE_URL (http://pihole:80), PIHOLE_PASSWORD
// ============================================================

import { Injectable, Logger, BadRequestException } from '@nestjs/common';

const PIHOLE_URL = (process.env.PIHOLE_URL || 'http://pihole:80').replace(/\/$/, '');
const PIHOLE_PASSWORD = process.env.PIHOLE_PASSWORD || '';

// Query statuses that mean "Pi-hole blocked it"
const BLOCKED = new Set([
  'GRAVITY', 'REGEX', 'DENYLIST', 'GRAVITY_CNAME', 'REGEX_CNAME', 'DENYLIST_CNAME',
  'EXTERNAL_BLOCKED_IP', 'EXTERNAL_BLOCKED_NULL', 'EXTERNAL_BLOCKED_NXRA', 'EXTERNAL_BLOCKED_EDE15', 'SPECIAL_DOMAIN',
]);

// One-click blocklists shown in the app
export const PRESET_LISTS = [
  { address: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/hosts', name: 'Steven Black Unified', desc: 'Ads + malware (Pi-hole default)' },
  { address: 'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/pro.txt', name: 'HaGeZi Pro', desc: 'Ads, trackers, telemetry — broad, rarely breaks sites' },
  { address: 'https://big.oisd.nl', name: 'OISD Big', desc: 'Large ad + malware list, tuned to avoid breakage' },
  { address: 'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/tif.txt', name: 'HaGeZi Threats', desc: 'Malware, phishing, scams' },
  { address: 'https://cdn.jsdelivr.net/gh/hagezi/dns-blocklists@latest/adblock/native.samsung.txt', name: 'Smart TV (Samsung)', desc: 'Samsung TV tracking' },
  { address: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/social-only/hosts', name: 'Social media', desc: 'Blocks Facebook, Instagram, TikTok… entirely' },
  { address: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/gambling-only/hosts', name: 'Gambling', desc: 'Casino and betting sites' },
  { address: 'https://raw.githubusercontent.com/StevenBlack/hosts/master/alternates/porn-only/hosts', name: 'Adult', desc: 'Adult sites' },
];

@Injectable()
export class PiholeService {
  private readonly logger = new Logger(PiholeService.name);
  private sid = '';
  private gravity = { running: false, ok: null as boolean | null, finishedAt: null as string | null, tail: '' };

  // ------------------------------------------------------------
  // API
  // ------------------------------------------------------------
  private async login() {
    if (!PIHOLE_PASSWORD) throw new BadRequestException('PIHOLE_PASSWORD is not set for the backend');
    let res: Response;
    try {
      res = await fetch(`${PIHOLE_URL}/api/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: PIHOLE_PASSWORD }),
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      throw new BadRequestException('Pi-hole is not reachable');
    }
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.session?.valid) throw new BadRequestException('Pi-hole login failed — check PIHOLE_PASSWORD');
    this.sid = data.session.sid;
  }

  private async api(route: string, init: { method?: string; body?: any; timeoutMs?: number } = {}, retry = true): Promise<any> {
    if (!this.sid) await this.login();
    let res: Response;
    try {
      res = await fetch(`${PIHOLE_URL}/api${route}`, {
        method: init.method || 'GET',
        headers: { 'X-FTL-SID': this.sid, ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(init.timeoutMs || 10000),
      });
    } catch {
      throw new BadRequestException('Pi-hole is not reachable');
    }
    if (res.status === 401 && retry) { this.sid = ''; return this.api(route, init, false); }
    if (res.status === 204) return {};
    const data: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new BadRequestException(data?.error?.message || `Pi-hole: ${res.status}`);
    const failed = data?.processed?.errors?.[0];
    if (failed) throw new BadRequestException(`Pi-hole: ${failed.error || 'not accepted'}`);
    return data;
  }

  // ------------------------------------------------------------
  // STATUS
  // ------------------------------------------------------------
  async status() {
    if (!PIHOLE_PASSWORD) return { reachable: false, configured: false, error: 'PIHOLE_PASSWORD is not set for the backend' };
    try {
      const [summary, blocking, clients] = await Promise.all([
        this.api('/stats/summary'),
        this.api('/dns/blocking'),
        this.api('/stats/top_clients?count=25'),
      ]);
      return {
        reachable: true, configured: true, error: null,
        blocking: blocking.blocking === 'enabled',
        timer: blocking.timer ?? null,                       // seconds until it turns back on
        queries: summary.queries?.total ?? 0,
        blocked: summary.queries?.blocked ?? 0,
        percent: Math.round((summary.queries?.percent_blocked ?? 0) * 10) / 10,
        domainsOnLists: summary.gravity?.domains_being_blocked ?? 0,
        listsUpdated: summary.gravity?.last_update ? new Date(summary.gravity.last_update * 1000).toISOString() : null,
        clients: (clients.clients || []).map((c: any) => ({ ip: c.ip, name: c.name || '', queries: c.count })),
        gravity: this.gravity,
      };
    } catch (e: any) {
      return { reachable: false, configured: true, error: e?.response?.message || e?.message || 'Pi-hole is not reachable' };
    }
  }

  // enabled=false + seconds → off for that long, then back on by itself
  async setBlocking(enabled: boolean, seconds?: number | null) {
    const r = await this.api('/dns/blocking', { method: 'POST', body: { blocking: !!enabled, timer: !enabled && seconds ? Math.round(seconds) : null } });
    return { blocking: r.blocking === 'enabled', timer: r.timer ?? null };
  }

  // ------------------------------------------------------------
  // YOUR DOMAINS (always block / always allow)
  // ------------------------------------------------------------
  async domains() {
    const r = await this.api('/domains');
    return (r.domains || []).map((d: any) => ({
      domain: d.domain, type: d.type as 'allow' | 'deny', kind: d.kind as 'exact' | 'regex',
      enabled: !!d.enabled, comment: d.comment || '', added: d.date_added,
    }));
  }

  async addDomain(domain: string, type: 'allow' | 'deny', kind: 'exact' | 'regex' = 'exact') {
    const d = this.cleanDomain(domain, kind);
    if (!['allow', 'deny'].includes(type)) throw new BadRequestException('type must be allow or deny');
    // Moving a domain from one list to the other: remove it from the old one first
    const other = type === 'allow' ? 'deny' : 'allow';
    await this.api(`/domains/${other}/${kind}/${encodeURIComponent(d)}`, { method: 'DELETE' }).catch(() => {});
    await this.api(`/domains/${type}/${kind}`, { method: 'POST', body: { domain: d, comment: 'Added in HServer', enabled: true } });
    return { success: true, domain: d, type };
  }

  async removeDomain(type: string, kind: string, domain: string) {
    await this.api(`/domains/${type}/${kind}/${encodeURIComponent(domain)}`, { method: 'DELETE' });
    return { success: true };
  }

  private cleanDomain(domain: string, kind: string) {
    let d = String(domain || '').trim();
    if (kind === 'exact') {
      d = d.toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/:?#].*$/, '');
      if (!/^[a-z0-9]([a-z0-9_-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d)) throw new BadRequestException(`Not a domain: ${domain}`);
    }
    if (!d) throw new BadRequestException('Type a domain');
    return d;
  }

  // ------------------------------------------------------------
  // BLOCKLISTS
  // ------------------------------------------------------------
  async lists() {
    const r = await this.api('/lists?type=block');
    const mine = (r.lists || []).map((l: any) => ({
      address: l.address, enabled: !!l.enabled, comment: l.comment || '',
      domains: l.number ?? 0, updated: l.date_updated ? new Date(l.date_updated * 1000).toISOString() : null,
      // 0 = not downloaded yet, 1 = ok, 2 = unchanged, 3 = download failed (old copy used), 4 = failed
      status: l.status ?? 0,
    }));
    const presets = PRESET_LISTS.map(p => ({ ...p, added: mine.some((m: any) => m.address === p.address) }));
    return { lists: mine, presets };
  }

  async addList(address: string, comment?: string) {
    const a = String(address || '').trim();
    if (!/^https?:\/\/\S+$/i.test(a)) throw new BadRequestException('A blocklist is a http(s) link');
    const preset = PRESET_LISTS.find(p => p.address === a);
    await this.api('/lists?type=block', { method: 'POST', body: { address: a, comment: comment || preset?.name || 'Added in HServer', enabled: true } });
    return { success: true, needsUpdate: true };
  }

  async setListEnabled(address: string, enabled: boolean) {
    const current = (await this.lists()).lists.find((l: any) => l.address === address);
    if (!current) throw new BadRequestException('No such list');
    await this.api(`/lists/${encodeURIComponent(address)}?type=block`, {
      method: 'PUT', body: { enabled: !!enabled, comment: current.comment, type: 'block', groups: [0] },
    });
    return { success: true, needsUpdate: true };
  }

  async removeList(address: string) {
    await this.api(`/lists/${encodeURIComponent(address)}?type=block`, { method: 'DELETE' });
    return { success: true, needsUpdate: true };
  }

  // Download the lists again (Pi-hole calls this "gravity"). Takes a minute; runs in the background.
  updateLists() {
    if (this.gravity.running) return { running: true };
    this.gravity = { running: true, ok: null, finishedAt: null, tail: '' };
    (async () => {
      let text = '';
      let ok = false;
      try {
        if (!this.sid) await this.login();
        const res = await fetch(`${PIHOLE_URL}/api/action/gravity`, {
          method: 'POST', headers: { 'X-FTL-SID': this.sid }, signal: AbortSignal.timeout(15 * 60_000),
        });
        text = await res.text();
        ok = res.ok && !/gravity failed|\[✗\]/i.test(text);
      } catch (e: any) {
        text += `\n${e?.message || e}`;
      }
      // eslint-disable-next-line no-control-regex
      const clean = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '\n');
      this.gravity = {
        running: false, ok, finishedAt: new Date().toISOString(),
        tail: clean.split('\n').map(l => l.trim()).filter(Boolean).slice(-8).join('\n'),
      };
      this.logger.log(`Pi-hole lists updated: ${ok ? 'ok' : 'failed'}`);
    })();
    return { running: true };
  }

  // ------------------------------------------------------------
  // RECENTLY BLOCKED — "a site broke": find its domain and allow it
  // ------------------------------------------------------------
  async recentBlocked(client?: string) {
    const r = await this.api(`/queries?length=1000${client ? `&client_ip=${encodeURIComponent(client)}` : ''}`);
    const byDomain = new Map<string, { domain: string; count: number; last: number; client: string; why: string }>();
    for (const q of r.queries || []) {
      if (!BLOCKED.has(q.status)) continue;
      const cur = byDomain.get(q.domain);
      if (cur) { cur.count++; cur.last = Math.max(cur.last, q.time); continue; }
      byDomain.set(q.domain, {
        domain: q.domain, count: 1, last: q.time,
        client: q.client?.name || q.client?.ip || '',
        why: q.status.startsWith('DENYLIST') ? 'your block list' : q.status.startsWith('REGEX') ? 'a pattern' : 'a blocklist',
      });
    }
    return [...byDomain.values()].sort((a, b) => b.last - a.last).slice(0, 100)
      .map(d => ({ ...d, last: new Date(d.last * 1000).toISOString() }));
  }
}