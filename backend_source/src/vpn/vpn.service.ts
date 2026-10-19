// ============================================================
// REMOTE ACCESS SERVICE - WireGuard + DuckDNS status
// ============================================================
// Away from home your phone/laptop connects to the "wireguard"
// container (UDP 51820, forwarded by the Eero) using your DuckDNS name.
// Split tunnel: only HServer (10.10.0.x) and the VPN subnet go home —
// the app, files, region proxies and Pi-hole DNS (so ads stay blocked);
// normal browsing goes straight out.
// This service shows:
//   - whether your DuckDNS name points at your current home IP
//   - each device: its VPN address, connected / last seen, data used
//   - the device's setup QR code / .conf (only with SETUP_PIN — they contain the device's key)
// Reads: WG_CONFIG_DIR (the wireguard container's /config, read-only)
//        WG_STATUS_FILE (written every 30 s by the wireguard_status container: `wg show all dump`)
// Settings: REMOTE_HOSTNAME (your DuckDNS name), SETUP_PIN
// ============================================================

import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { promises as dns } from 'dns';

const CONFIG_DIR = process.env.WG_CONFIG_DIR || '/app/vpn-configs';
const STATUS_FILE = process.env.WG_STATUS_FILE || '/app/wg-status/wg-status.txt';
const HOSTNAME = (process.env.REMOTE_HOSTNAME || '').trim().replace(/^https?:\/\//, '').replace(/[:/].*$/, '');
const SETUP_PIN = process.env.SETUP_PIN || '';
const ONLINE_SECONDS = 180;   // WireGuard re-handshakes every 2 minutes while traffic flows

interface PeerStatus { endpoint: string; handshake: number; rx: number; tx: number }

@Injectable()
export class VpnService {
  private ipCache: { ip: string | null; at: number } = { ip: null, at: 0 };

  // ------------------------------------------------------------
  async status() {
    const [publicIp, hostnameIp] = await Promise.all([this.publicIp(), this.resolveHostname()]);
    const { peers: live, updatedAt } = this.readStatus();
    const peers = this.peerNames().map(name => {
      const conf = this.readPeerConf(name);
      const key = this.read(path.join(CONFIG_DIR, `peer_${name}`, `publickey-peer_${name}`))?.trim() || '';
      const s = live.get(key);
      const handshake = s?.handshake || 0;
      return {
        name,
        address: conf.address,
        online: !!handshake && Date.now() / 1000 - handshake < ONLINE_SECONDS,
        lastHandshake: handshake ? new Date(handshake * 1000).toISOString() : null,
        rx: s?.rx || 0,
        tx: s?.tx || 0,
        hasQr: fs.existsSync(path.join(CONFIG_DIR, `peer_${name}`, `peer_${name}.png`)),
      };
    });
    const first = peers.length ? this.readPeerConf(peers[0].name) : null;
    return {
      hostname: HOSTNAME || null,
      port: 51820,
      publicIp,
      hostnameIp,
      dnsOk: !!(publicIp && hostnameIp && publicIp === hostnameIp),
      serverRunning: !!updatedAt && Date.now() - updatedAt < 120_000,
      statusUpdatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
      tunnel: { allowedIps: first?.allowedIps || null, dns: first?.dns || null, endpoint: first?.endpoint || null },
      peers,
      canShowSetup: !!SETUP_PIN,
    };
  }

  // Device setup (QR picture or .conf text) — contains the device's private key, so it needs SETUP_PIN
  peerSetup(name: string, pin: string | undefined, kind: 'qr' | 'conf'): Buffer {
    this.checkPin(pin);
    if (!this.peerNames().includes(name)) throw new NotFoundException('No such device');
    const file = path.join(CONFIG_DIR, `peer_${name}`, kind === 'qr' ? `peer_${name}.png` : `peer_${name}.conf`);
    if (!fs.existsSync(file)) throw new NotFoundException('The wireguard container has not made this file yet');
    return fs.readFileSync(file);
  }

  private checkPin(pin?: string) {
    if (!SETUP_PIN) throw new ForbiddenException('Set SETUP_PIN for the backend to show device setup in the app');
    const a = crypto.createHash('sha256').update(String(pin || '')).digest();
    const b = crypto.createHash('sha256').update(SETUP_PIN).digest();
    if (!crypto.timingSafeEqual(a, b)) throw new ForbiddenException('Wrong PIN');
  }

  // ------------------------------------------------------------
  private read(file: string): string | null {
    try { return fs.readFileSync(file, 'utf8'); } catch { return null; }
  }

  private peerNames(): string[] {
    try {
      return fs.readdirSync(CONFIG_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && d.name.startsWith('peer_'))
        .map(d => d.name.slice(5))
        .filter(n => /^[A-Za-z0-9_-]+$/.test(n))
        .sort();
    } catch {
      return [];
    }
  }

  private readPeerConf(name: string) {
    const text = this.read(path.join(CONFIG_DIR, `peer_${name}`, `peer_${name}.conf`)) || '';
    const get = (k: string) => new RegExp(`^\\s*${k}\\s*=\\s*(.+)$`, 'mi').exec(text)?.[1].trim() || null;
    return { address: get('Address'), allowedIps: get('AllowedIPs'), dns: get('DNS'), endpoint: get('Endpoint') };
  }

  // `wg show all dump`: interface lines have 5 fields, peer lines 9:
  // iface pubkey psk endpoint allowed-ips latest-handshake rx tx keepalive
  private readStatus(): { peers: Map<string, PeerStatus>; updatedAt: number | null } {
    const peers = new Map<string, PeerStatus>();
    let updatedAt: number | null = null;
    try {
      updatedAt = fs.statSync(STATUS_FILE).mtimeMs;
      for (const line of fs.readFileSync(STATUS_FILE, 'utf8').split('\n')) {
        const f = line.trim().split('\t');
        if (f.length < 9) continue;
        peers.set(f[1], { endpoint: f[3], handshake: Number(f[5]) || 0, rx: Number(f[6]) || 0, tx: Number(f[7]) || 0 });
      }
    } catch {}
    return { peers, updatedAt };
  }

  private async publicIp(): Promise<string | null> {
    if (this.ipCache.ip && Date.now() - this.ipCache.at < 5 * 60_000) return this.ipCache.ip;
    for (const url of ['https://api.ipify.org', 'https://ifconfig.me/ip', 'https://icanhazip.com']) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(4000), headers: { 'User-Agent': 'curl/8' } });
        const ip = (await res.text()).trim();
        if (res.ok && /^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) { this.ipCache = { ip, at: Date.now() }; return ip; }
      } catch {}
    }
    return null;
  }

  private async resolveHostname(): Promise<string | null> {
    if (!HOSTNAME) return null;
    try { return (await dns.resolve4(HOSTNAME))[0] || null; } catch { return null; }
  }
}