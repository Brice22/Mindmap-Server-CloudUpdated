'use client';

// ============================================================
// 🧰 SERVICES - every HServer web page in one list
// ============================================================
// No more remembering ports: each card opens the page in a new tab
// and shows whether it's up (🟢) or not (🔴), checked by the backend
// every 30 s while this tab is open.
// Addresses use whatever you opened the app with (192.168.4.194 at
// home and over the VPN), so the links work from any device.
// To add a service: one entry in SERVICES below, and its check in
// backend_source/src/services/services.controller.ts.
// ============================================================

import React, { useEffect, useState } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface Service {
  id: string;
  name: string;
  port: number;
  path?: string;
  what: string;
  login?: string;
  note?: string;
  group: 'Use' | 'Admin' | 'Not set up yet' | 'Not in use';
}

const SERVICES: Service[] = [
  { id: 'keycloak-account', name: '👤 My account', port: 8443, path: '/auth/realms/hserver/account', what: 'Change your password, see where you are logged in', login: 'your HServer login (brice)', group: 'Use' },
  { id: 'qbittorrent', name: '⬇ qBittorrent', port: 8090, what: 'Full torrent client (the app\'s Torrents tab covers the basics)', login: 'admin + QBIT_PASS from .env', group: 'Use' },
  { id: 'pihole', name: '🛡️ Pi-hole', port: 8053, path: '/admin/', what: 'Ad blocking: query log, allow/block lists', login: 'PIHOLE_PASSWORD from .env', group: 'Admin' },
  { id: 'keycloak', name: '🔑 Keycloak admin', port: 8443, path: '/auth/admin/', what: 'Add family accounts, roles, reset passwords', login: 'admin + KC_ADMIN_PASS from .env', group: 'Admin' },
  { id: 'neo4j', name: '🧭 Neo4j Browser', port: 7474, what: 'Look at the graph copy, run Cypher queries', login: 'Connect URL bolt://192.168.4.194:7687 · user neo4j · NEO4J_PASSWORD', group: 'Admin' },
  { id: 'meilisearch', name: '🔎 MeiliSearch', port: 7701, what: 'Search engine behind the search bar (no web page, just a status reply)', group: 'Admin' },
  { id: 'vaultwarden', name: '🔐 Vaultwarden', port: 8001, what: 'Password manager (Bitwarden apps)', note: 'Its web page needs HTTPS — works after the nginx/HTTPS step', group: 'Not set up yet' },
  { id: 'grafana', name: '📈 Grafana', port: 3002, what: 'Dashboards for server health', login: 'admin + GF_SECURITY_ADMIN_PASSWORD', note: 'Dashboards come with the monitoring step', group: 'Not set up yet' },
  { id: 'prometheus', name: '📊 Prometheus', port: 9090, what: 'Server and app measurements (feeds Grafana)', group: 'Not set up yet' },
  { id: 'loki', name: '📜 Loki', port: 3100, path: '/ready', what: 'Collects container logs (feeds Grafana)', group: 'Not set up yet' },
  { id: 'jenkins', name: '🏗 Jenkins', port: 8082, what: 'Automated builds', group: 'Not in use' },
  { id: 'ejbca', name: '📜 EJBCA', port: 8081, what: 'Certificate authority', group: 'Not in use' },
  { id: 'etherpad', name: '📝 Etherpad', port: 9001, what: 'Shared text pads (replaced by Excalidraw)', group: 'Not in use' },
];

const GROUPS: Service['group'][] = ['Use', 'Admin', 'Not set up yet', 'Not in use'];

export default function ServicesPanel() {
  const [status, setStatus] = useState<Record<string, { up: boolean; ms: number | null }>>({});
  const [checked, setChecked] = useState<Date | null>(null);
  const host = typeof window !== 'undefined' ? window.location.hostname : '192.168.4.194';

  useEffect(() => {
    let alive = true;
    const load = () => fetch(`${API_URL}/api/services`)
      .then(r => (r.ok ? r.json() : []))
      .then((list: any[]) => {
        if (!alive) return;
        setStatus(Object.fromEntries(list.map(s => [s.id, { up: s.up, ms: s.ms }])));
        setChecked(new Date());
      })
      .catch(() => {});
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const statusOf = (s: Service) => status[s.id.replace(/-account$/, '')];

  return (
    <div style={{ color: '#ccc', fontSize: 13 }}>
      <div style={{ color: '#888', marginBottom: 12 }}>
        Every HServer page in one place — click to open it in a new tab.
        {checked && <> Checked {checked.toLocaleTimeString()}.</>}
      </div>
      {GROUPS.map(group => (
        <div key={group} style={{ marginBottom: 18 }}>
          <div style={{ color: '#fff', fontSize: 14, marginBottom: 8 }}>{group}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {SERVICES.filter(s => s.group === group).map(s => {
              const st = statusOf(s);
              const url = `http://${host}:${s.port}${s.path || '/'}`;
              return (
                <a key={s.id} href={url} target="_blank" rel="noreferrer"
                  style={{ display: 'block', textDecoration: 'none', background: '#252536', border: '1px solid #3a3a4e', borderRadius: 6, padding: 12, color: '#ccc', opacity: group === 'Not in use' ? 0.7 : 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: '#fff', fontSize: 14, flex: 1 }}>{s.name}</span>
                    <span title={st ? (st.up ? `Up (${st.ms} ms)` : 'Not answering') : 'Checking…'}>{st ? (st.up ? '🟢' : '🔴') : '⚪'}</span>
                  </div>
                  <div style={{ marginTop: 4 }}>{s.what}</div>
                  <div style={{ marginTop: 6, color: '#60a5fa', fontSize: 12 }}>{host}:{s.port}{s.path || ''}</div>
                  {s.login && <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>Login: {s.login}</div>}
                  {s.note && <div style={{ marginTop: 4, color: '#f59e0b', fontSize: 12 }}>{s.note}</div>}
                </a>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}