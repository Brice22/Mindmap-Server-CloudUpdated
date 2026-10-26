'use client';

// ============================================================
// 🔒 NETWORK & SERVER
// ============================================================
//   🌍 Regions        browse & stream from other countries (VPN provider proxies)
//   🏠 Remote access  WireGuard from anywhere + DuckDNS name
//   🛡️ Ad blocking    Pi-hole for the devices you point at it
//   💾 Backups        nightly backup to the drive + cloud
// ============================================================

import React, { useEffect, useState } from 'react';
import RegionsPanel from './RegionsPanel';
import RemoteAccessPanel from './RemoteAccessPanel';
import PiholePanel from './PiholePanel';
import BackupsPanel from './BackupsPanel';
import ServicesPanel from './ServicesPanel';

type ActiveTab = 'services' | 'vpn' | 'remote' | 'pihole' | 'backups';

const TABS: { id: ActiveTab; label: string }[] = [
  { id: 'services', label: '🧰 Services' },
  { id: 'vpn', label: '🌍 Regions' },
  { id: 'remote', label: '🏠 Remote access' },
  { id: 'pihole', label: '🛡️ Ad blocking' },
  { id: 'backups', label: '💾 Backups' },
];

export default function NetworkPanel() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('services');

  // Remember the tab across refreshes
  useEffect(() => {
    try {
      const saved = localStorage.getItem('hserver.networkTab') as ActiveTab | null;
      if (saved && TABS.some(t => t.id === saved)) setActiveTab(saved);
    } catch {}
  }, []);
  const pick = (id: ActiveTab) => {
    setActiveTab(id);
    try { localStorage.setItem('hserver.networkTab', id); } catch {}
  };

  return (
    <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column', background: '#1e1e2e' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
        <h2 style={{ color: '#fff', margin: 0 }}>Network &amp; Server</h2>
      </div>

      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexShrink: 0, flexWrap: 'wrap' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => pick(tab.id)}
            style={{
              background: activeTab === tab.id ? '#0070f3' : '#333', border: 'none',
              color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {activeTab === 'services' && <ServicesPanel />}
        {activeTab === 'vpn' && <RegionsPanel />}
        {activeTab === 'remote' && <RemoteAccessPanel />}
        {activeTab === 'pihole' && <PiholePanel />}
        {activeTab === 'backups' && <BackupsPanel />}
      </div>
    </div>
  );
}