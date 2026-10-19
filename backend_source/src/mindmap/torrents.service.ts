// ============================================================
// TORRENTS SERVICE - qBittorrent behind its own VPN (gluetun)
// ============================================================
// qBittorrent runs inside the "torrent_vpn" gluetun container's
// network (docker-compose.override.yml): if the VPN drops, gluetun's
// firewall stops all torrent traffic — your home IP is never used.
// This service talks to qBittorrent's Web API:
//   add a magnet link / .torrent file (optionally for a node),
//   list with progress, pause/resume, delete.
// Finished downloads are added to the file library automatically
// (📁 Files → then their text is read and videos are converted).
// Downloads land in cloud_data/torrents (qBittorrent sees it as /downloads).
// Settings: QBIT_URL (http://torrent_vpn:8080), QBIT_USER, QBIT_PASS,
//   QBIT_DOWNLOAD_DIR (/downloads), TORRENT_VPN_HOST (torrent_vpn)
// ============================================================

import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../database/database.service';
import { FilesService } from './files.service';
import { absPath, mimeFromName } from './uploads';
import { gluetun } from './regions.service';

const QBIT_URL = (process.env.QBIT_URL || 'http://torrent_vpn:8080').replace(/\/$/, '');
const QBIT_USER = process.env.QBIT_USER || 'admin';
const QBIT_PASS = process.env.QBIT_PASS || '';
const QBIT_DIR = (process.env.QBIT_DOWNLOAD_DIR || '/downloads').replace(/\/$/, '');
const VPN_HOST = process.env.TORRENT_VPN_HOST || 'torrent_vpn';
const LIBRARY_DIR = 'torrents';        // cloud_data/torrents = qBittorrent's /downloads
const DONE_STATES = new Set(['uploading', 'stalledUP', 'pausedUP', 'stoppedUP', 'queuedUP', 'forcedUP', 'checkingUP']);

@Injectable()
export class TorrentsService {
  private readonly logger = new Logger(TorrentsService.name);
  private cookie = '';
  private importing = false;

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(FilesService) private readonly files: FilesService,
  ) {
    setInterval(() => this.importFinished().catch(() => {}), 30_000);
  }

  // ------------------------------------------------------------
  // qBittorrent Web API
  // ------------------------------------------------------------
  private async login() {
    const res = await fetch(`${QBIT_URL}/api/v2/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: QBIT_USER, password: QBIT_PASS }),
      signal: AbortSignal.timeout(8000),
    });
    const text = (await res.text()).trim();
    // qBittorrent 4/5.0–5.1: 200 "Ok." + cookie SID=…; 5.2+: 204 + cookie QBT_SID_<port>=…
    const cookie = /((?:QBT_)?SID[^=;,\s]*=[^;]+)/.exec(res.headers.get('set-cookie') || '')?.[1];
    if (!res.ok || /fail/i.test(text) || !cookie) throw new BadRequestException('qBittorrent login failed — check QBIT_USER / QBIT_PASS');
    this.cookie = cookie;
  }

  private async api(route: string, init: { method?: string; body?: any } = {}, retry = true): Promise<any> {
    if (!this.cookie) await this.login();
    let res: Response;
    try {
      res = await fetch(`${QBIT_URL}${route}`, {
        method: init.method || 'GET',
        body: init.body,
        headers: { Cookie: this.cookie },
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new BadRequestException('qBittorrent is not reachable (is the torrent VPN running?)');
    }
    if (res.status === 403 && retry) { this.cookie = ''; return this.api(route, init, false); }
    if (res.status === 404 && init.method === 'POST') return { notFound: true };
    if (!res.ok) throw new BadRequestException(`qBittorrent: ${res.status} ${await res.text().catch(() => '')}`.trim());
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  }

  private form(fields: Record<string, string>) {
    const f = new FormData();
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    return f;
  }

  // ------------------------------------------------------------
  // ROUTES
  // ------------------------------------------------------------
  async status() {
    let version: string | null = null;
    let error: string | null = null;
    try { version = String(await this.api('/api/v2/app/version')); } catch (e: any) { error = e?.response?.message || e?.message || 'not reachable'; }
    let vpn: any = null;
    try { vpn = await gluetun(VPN_HOST, '/v1/publicip/ip'); } catch {}
    let port: any = null;
    try { port = (await gluetun(VPN_HOST, '/v1/portforward'))?.port ?? null; } catch {
      try { port = (await gluetun(VPN_HOST, '/v1/openvpn/portforwarded'))?.port ?? null; } catch {}
    }
    return {
      configured: !!QBIT_PASS,
      reachable: !!version,
      version, error,
      vpn: vpn?.public_ip ? { ip: vpn.public_ip, country: vpn.country, city: vpn.city } : null,
      forwardedPort: port || null,
    };
  }

  async list() {
    const items: any[] = await this.api('/api/v2/torrents/info?sort=added_on&reverse=true');
    const imported = new Set((await this.db.query('SELECT hash FROM torrent_imports')).rows.map((r: any) => r.hash));
    return (Array.isArray(items) ? items : []).map(t => ({
      hash: t.hash, name: t.name, size: t.size, progress: t.progress,
      dlspeed: t.dlspeed, upspeed: t.upspeed, eta: t.eta, state: t.state,
      seeds: t.num_seeds, peers: t.num_leechs, ratio: t.ratio,
      addedOn: t.added_on, nodeId: this.nodeFromTags(t.tags),
      done: t.progress >= 1, imported: imported.has(t.hash),
    }));
  }

  async add(opts: { urls?: string; file?: Express.Multer.File; nodeId?: number | null }) {
    const urls = String(opts.urls || '').split(/\s+/).map(s => s.trim()).filter(Boolean);
    if (!urls.length && !opts.file) throw new BadRequestException('Paste a magnet link or choose a .torrent file');
    for (const u of urls) {
      if (!/^(magnet:\?|https?:\/\/)/i.test(u)) throw new BadRequestException(`Not a magnet or http(s) link: ${u.slice(0, 60)}`);
    }
    const f = this.form({ savepath: QBIT_DIR, category: 'hserver', tags: opts.nodeId ? `node-${opts.nodeId}` : '' });
    if (urls.length) f.append('urls', urls.join('\n'));
    if (opts.file) f.append('torrents', new Blob([fs.readFileSync(opts.file.path)]), opts.file.originalname || 'file.torrent');
    const res = await this.api('/api/v2/torrents/add', { method: 'POST', body: f });
    if (opts.file) fs.promises.rm(opts.file.path, { force: true }).catch(() => {});
    if (typeof res === 'string' && /fail/i.test(res)) throw new BadRequestException('qBittorrent refused it (already added, or not a valid torrent)');
    return { success: true };
  }

  // qBittorrent 5 renamed pause/resume to stop/start — try the new name first
  async pause(hash: string) {
    const r = await this.api('/api/v2/torrents/stop', { method: 'POST', body: this.form({ hashes: hash }) });
    if (r?.notFound) await this.api('/api/v2/torrents/pause', { method: 'POST', body: this.form({ hashes: hash }) });
    return { success: true };
  }

  async resume(hash: string) {
    const r = await this.api('/api/v2/torrents/start', { method: 'POST', body: this.form({ hashes: hash }) });
    if (r?.notFound) await this.api('/api/v2/torrents/resume', { method: 'POST', body: this.form({ hashes: hash }) });
    return { success: true };
  }

  // Removing a torrent keeps its files in the library unless deleteFiles is set
  async remove(hash: string, deleteFiles: boolean) {
    await this.api('/api/v2/torrents/delete', { method: 'POST', body: this.form({ hashes: hash, deleteFiles: deleteFiles ? 'true' : 'false' }) });
    if (deleteFiles) {
      const rows = (await this.db.query('SELECT file_ids FROM torrent_imports WHERE hash = $1', [hash])).rows;
      for (const id of rows[0]?.file_ids || []) await this.files.remove(id).catch(() => {});
    }
    await this.db.query('DELETE FROM torrent_imports WHERE hash = $1', [hash]);
    return { success: true };
  }

  // ------------------------------------------------------------
  // FINISHED → FILE LIBRARY
  // ------------------------------------------------------------
  private nodeFromTags(tags: string): number | null {
    const m = /(?:^|,\s*)node-(\d+)/.exec(String(tags || ''));
    return m ? Number(m[1]) : null;
  }

  async importFinished() {
    if (this.importing || !QBIT_PASS) return;
    this.importing = true;
    try {
      const items: any[] = await this.api('/api/v2/torrents/info?filter=completed');
      const done = (Array.isArray(items) ? items : []).filter(t => t.progress >= 1 || DONE_STATES.has(t.state));
      for (const t of done) {
        const seen = await this.db.query('SELECT 1 FROM torrent_imports WHERE hash = $1', [t.hash]);
        if (seen.rows.length) continue;
        const contentPath = String(t.content_path || path.posix.join(t.save_path || QBIT_DIR, t.name));
        if (!contentPath.startsWith(QBIT_DIR + '/')) {
          this.logger.warn(`Torrent "${t.name}" is outside ${QBIT_DIR} — not added to the library`);
          await this.db.query('INSERT INTO torrent_imports (hash, name, file_ids) VALUES ($1, $2, $3)', [t.hash, t.name, []]);
          continue;
        }
        const rel = LIBRARY_DIR + contentPath.slice(QBIT_DIR.length);
        const ids: number[] = [];
        for (const fileRel of this.walk(rel)) {
          const st = fs.statSync(absPath(fileRel));
          const row = await this.files.register({
            path: fileRel, name: path.posix.basename(fileRel), mime: mimeFromName(fileRel), size: st.size,
            nodeId: this.nodeFromTags(t.tags), kind: 'web',
          });
          ids.push(row.id);
        }
        await this.db.query('INSERT INTO torrent_imports (hash, name, file_ids) VALUES ($1, $2, $3)', [t.hash, t.name, ids]);
        this.logger.log(`Torrent finished: "${t.name}" → ${ids.length} file(s) in the library`);
      }
    } finally {
      this.importing = false;
    }
  }

  // All files under a path (a torrent is one file or a folder), skipping qBittorrent's part files
  private walk(rel: string): string[] {
    const abs = absPath(rel);
    if (!fs.existsSync(abs)) return [];
    if (fs.statSync(abs).isFile()) return /\.(!qB|parts)$/.test(rel) ? [] : [rel];
    return fs.readdirSync(abs).flatMap(n => (n.startsWith('.') ? [] : this.walk(`${rel}/${n}`)));
  }
}