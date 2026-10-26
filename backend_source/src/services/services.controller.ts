// ============================================================
// 🧰 SERVICES - is each of HServer's web pages up right now?
// ============================================================
//   GET /api/services   [{ id, up, ms }]
// The backend checks each service from inside Docker (it sits on
// every network), so the answer is the same from home or the VPN.
// Any answer at all counts as "up" (even a login page or a redirect).
// The list of names, ports and descriptions is in the frontend
// (ServicesPanel.tsx) — add a service there and here.
// ============================================================

import { Controller, Get } from '@nestjs/common';

const CHECKS: Record<string, string> = {
  keycloak: 'http://keycloak:8080/auth/realms/master',
  pihole: `${process.env.PIHOLE_URL || 'http://10.10.0.53'}/admin/`,
  neo4j: 'http://neo4j:7474/',
  qbittorrent: 'http://qbittorrent:8080/',
  meilisearch: 'http://meilisearch:7700/health',
  grafana: 'http://grafana:3000/api/health',
  prometheus: 'http://prometheus:9090/-/healthy',
  loki: 'http://loki:3100/ready',
  vaultwarden: 'http://vaultwarden:80/alive',
  jenkins: 'http://jenkins:8080/login',
  ejbca: 'http://ejbca:8080/',
  etherpad: 'http://etherpad:9001/',
};

@Controller('services')
export class ServicesController {
  @Get()
  async status() {
    return Promise.all(Object.entries(CHECKS).map(async ([id, url]) => {
      const start = Date.now();
      try {
        await fetch(url, { method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(2500) });
        return { id, up: true, ms: Date.now() - start };
      } catch {
        return { id, up: false, ms: null };
      }
    }));
  }
}