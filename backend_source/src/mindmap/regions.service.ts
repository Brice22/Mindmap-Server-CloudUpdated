// ============================================================
// REGIONS SERVICE - browse & stream from other countries
// ============================================================
// Each region is a gluetun container (docker-compose.override.yml)
// connected to your VPN provider in one country. It offers:
//   - an HTTP proxy      → laptop browser (e.g. FoxyProxy), per region
//   - a Shadowsocks proxy → phone/TV apps (Shadowrocket, v2rayNG, …)
// Pick the region per browser tab/app instead of switching the whole
// house. If a streaming site blocks the server you got, "New server"
// reconnects to another one in the same country.
// The app reads each container's control server (port 8000, inside
// Docker only) for its public IP and country.
// Regions list: the defaults below match docker-compose.override.yml;
// to change them put a JSON array in VPN_REGIONS (same fields).
// HSERVER_LAN_IP = the address your devices use to reach HServer.
// ============================================================

import { Injectable, Logger, NotFoundException } from '@nestjs/common';

export interface Region {
  id: string;
  name: string;
  flag: string;
  host: string;        // container name (control server at http://host:8000)
  httpPort: number;    // published HTTP proxy port on HServer
  socksPort: number;   // published Shadowsocks port on HServer
}

const DEFAULT_REGIONS: Region[] = [
  { id: 'us', name: 'United States', flag: '🇺🇸', host: 'vpn_us', httpPort: 8881, socksPort: 8381 },
  { id: 'uk', name: 'United Kingdom', flag: '🇬🇧', host: 'vpn_uk', httpPort: 8882, socksPort: 8382 },
  { id: 'jp', name: 'Japan', flag: '🇯🇵', host: 'vpn_jp', httpPort: 8883, socksPort: 8383 },
];

function loadRegions(): Region[] {
  try {
    const list = JSON.parse(process.env.VPN_REGIONS || 'null');
    if (Array.isArray(list) && list.length) return list;
  } catch {}
  return DEFAULT_REGIONS;
}

// GET/PUT a gluetun control server route (short timeout: a stopped region just shows as down)
export async function gluetun(host: string, route: string, method = 'GET', body?: any): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 4000);
  try {
    const res = await fetch(`http://${host}:8000${route}`, {
      method, signal: ctrl.signal,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const text = await res.text();
    try { return JSON.parse(text); } catch { return text; }
  } finally {
    clearTimeout(timer);
  }
}

@Injectable()
export class RegionsService {
  private readonly logger = new Logger(RegionsService.name);
  private readonly regions = loadRegions();
  private readonly lanIp = process.env.HSERVER_LAN_IP || '192.168.4.194';

  async list() {
    return Promise.all(this.regions.map(async r => {
      let ip: any = null;
      let status: string | null = null;
      try { status = (await gluetun(r.host, '/v1/vpn/status'))?.status ?? null; } catch {}
      if (status === 'running') {
        try { ip = await gluetun(r.host, '/v1/publicip/ip'); } catch {}
      }
      return {
        id: r.id, name: r.name, flag: r.flag,
        up: status === 'running' && !!ip?.public_ip,
        status: status || 'unreachable',
        publicIp: ip?.public_ip || null,
        country: ip?.country || null,
        city: ip?.city || null,
        httpProxy: `http://${this.lanIp}:${r.httpPort}`,
        shadowsocks: { host: this.lanIp, port: r.socksPort, cipher: 'chacha20-ietf-poly1305' },
      };
    }));
  }

  // Reconnect to another server in the same country (e.g. a site blocked this one)
  async newServer(id: string) {
    const r = this.regions.find(x => x.id === id);
    if (!r) throw new NotFoundException('No such region');
    await gluetun(r.host, '/v1/vpn/status', 'PUT', { status: 'stopped' });
    await new Promise(res => setTimeout(res, 1500));
    await gluetun(r.host, '/v1/vpn/status', 'PUT', { status: 'running' });
    this.logger.log(`Region ${r.name}: reconnecting to a new server`);
    return { success: true };
  }
}