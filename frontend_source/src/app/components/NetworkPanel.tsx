'use client';

import React, { useState, useEffect } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface VPNExit {
  id: string;
  name: string;
  country: string;
  flag: string;
  type: 'vps' | 'tor' | 'direct';
  host?: string;
  port?: number;
  publicKey?: string;
  enabled: boolean;
}

interface WGPeer {
  id: string;
  name: string;
  publicKey: string;
  allowedIPs: string;
  lastHandshake?: string;
  transferRx?: string;
  transferTx?: string;
  enabled: boolean;
}

interface PiholeEntry {
  id: string;
  domain: string;
  type: 'blacklist' | 'whitelist';
  enabled: boolean;
}

interface DNSConfig {
  domain: string;
  provider: string;
  token: string;
  lastUpdate: string;
}

const DEFAULT_EXITS: VPNExit[] = [
  { id: 'direct', name: 'Direct', country: 'None', flag: '🌐', type: 'direct', enabled: true },
  { id: 'tor', name: 'Tor Network', country: 'Random', flag: '🧅', type: 'tor', enabled: true },
  { id: 'de', name: 'Germany', country: 'DE', flag: '🇩🇪', type: 'vps', enabled: false },
  { id: 'pl', name: 'Poland', country: 'PL', flag: '🇵🇱', type: 'vps', enabled: false },
  { id: 'jp', name: 'Japan', country: 'JP', flag: '🇯🇵', type: 'vps', enabled: false },
  { id: 'kr-n', name: 'North Korea', country: 'KP', flag: '🇰🇵', type: 'vps', enabled: false },
  { id: 'kr-s', name: 'South Korea', country: 'KR', flag: '🇰🇷', type: 'vps', enabled: false },
  { id: 'au', name: 'Australia', country: 'AU', flag: '🇦🇺', type: 'vps', enabled: false },
  { id: 'il', name: 'Israel', country: 'IL', flag: '🇮🇱', type: 'vps', enabled: false },
  { id: 'ir', name: 'Iran', country: 'IR', flag: '🇮🇷', type: 'vps', enabled: false },
  { id: 'gb', name: 'United Kingdom', country: 'GB', flag: '🇬🇧', type: 'vps', enabled: false },
  { id: 'cn', name: 'China', country: 'CN', flag: '🇨🇳', type: 'vps', enabled: false },
  { id: 'ru', name: 'Russia', country: 'RU', flag: '🇷🇺', type: 'vps', enabled: false },
  { id: 'in', name: 'India', country: 'IN', flag: '🇮🇳', type: 'vps', enabled: false },
  { id: 'mm', name: 'Myanmar', country: 'MM', flag: '🇲🇲', type: 'vps', enabled: false },
  { id: 'sy', name: 'Syria', country: 'SY', flag: '🇸🇾', type: 'vps', enabled: false },
  { id: 'cu', name: 'Cuba', country: 'CU', flag: '🇨🇺', type: 'vps', enabled: false },
  { id: 'ng', name: 'Nigeria', country: 'NG', flag: '🇳🇬', type: 'vps', enabled: false },
  { id: 'br', name: 'Brazil', country: 'BR', flag: '🇧🇷', type: 'vps', enabled: false },
  { id: 'vn', name: 'Vietnam', country: 'VN', flag: '🇻🇳', type: 'vps', enabled: false },
  { id: 'af', name: 'Afghanistan', country: 'AF', flag: '🇦🇫', type: 'vps', enabled: false },
  { id: 'so', name: 'Somalia', country: 'SO', flag: '🇸🇴', type: 'vps', enabled: false },
  { id: 'ly', name: 'Libya', country: 'LY', flag: '🇱🇾', type: 'vps', enabled: false },
  { id: 'cd', name: 'Congo', country: 'CD', flag: '🇨🇩', type: 'vps', enabled: false },
  { id: 'td', name: 'Chad', country: 'TD', flag: '🇹🇩', type: 'vps', enabled: false },
  { id: 'by', name: 'Belarus', country: 'BY', flag: '🇧🇾', type: 'vps', enabled: false },
];

type ActiveTab = 'vpn' | 'peers' | 'pihole' | 'dns';

export default function NetworkPanel() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('vpn');
  const [exits, setExits] = useState<VPNExit[]>(DEFAULT_EXITS);
  const [activeExit, setActiveExit] = useState<string>('direct');
  const [peers, setPeers] = useState<WGPeer[]>([
    { id: 'phone', name: 'Phone', publicKey: '', allowedIPs: '10.13.13.2/32', enabled: true },
    { id: 'laptop', name: 'Laptop', publicKey: '', allowedIPs: '10.13.13.3/32', enabled: true },
    { id: 'tablet', name: 'Tablet', publicKey: '', allowedIPs: '10.13.13.4/32', enabled: true },
  ]);
  const [piholeEntries, setPiholeEntries] = useState<PiholeEntry[]>([]);
  const [piholeEnabled, setPiholeEnabled] = useState(true);
  const [dnsConfig, setDnsConfig] = useState<DNSConfig>({
    domain: '', provider: 'duckdns', token: '', lastUpdate: '',
  });

  // VPN forms
  const [showAddExit, setShowAddExit] = useState(false);
  const [newExitName, setNewExitName] = useState('');
  const [newExitCountry, setNewExitCountry] = useState('');
  const [newExitFlag, setNewExitFlag] = useState('🏳️');
  const [newExitHost, setNewExitHost] = useState('');
  const [newExitPort, setNewExitPort] = useState('51820');
  const [newExitKey, setNewExitKey] = useState('');

  // Peer forms
  const [showAddPeer, setShowAddPeer] = useState(false);
  const [newPeerName, setNewPeerName] = useState('');

  // Pihole forms
  const [showAddDomain, setShowAddDomain] = useState(false);
  const [newDomain, setNewDomain] = useState('');
  const [newDomainType, setNewDomainType] = useState<'blacklist' | 'whitelist'>('blacklist');

  // Switch VPN exit
  const switchExit = async (exitId: string) => {
    try {
      await fetch(`${API_URL}/api/vpn/switch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: exitId }),
      });
      setActiveExit(exitId);
    } catch (e) {
      console.warn('VPN switch failed:', e);
      setActiveExit(exitId);
    }
  };

  // Add custom VPS exit
  const handleAddExit = () => {
    if (!newExitName.trim() || !newExitHost.trim()) return;
    const id = `custom-${Date.now()}`;
    setExits(prev => [...prev, {
      id,
      name: newExitName.trim(),
      country: newExitCountry.toUpperCase() || '??',
      flag: newExitFlag || '🏳️',
      type: 'vps',
      host: newExitHost.trim(),
      port: parseInt(newExitPort) || 51820,
      publicKey: newExitKey.trim(),
      enabled: true,
    }]);
    setNewExitName(''); setNewExitHost(''); setNewExitKey('');
    setNewExitCountry(''); setNewExitFlag('🏳️');
    setShowAddExit(false);
  };

  // Configure VPS exit node
  const configureExit = (exit: VPNExit) => {
    const host = prompt(`Enter VPS IP/hostname for ${exit.name}:`, exit.host || '');
    if (!host) return;
    const pubKey = prompt(`Enter VPS WireGuard public key:`, exit.publicKey || '');
    setExits(prev => prev.map(e => e.id === exit.id ? {
      ...e, host: host.trim(), publicKey: pubKey?.trim() || '', enabled: true,
    } : e));
  };

  // Add peer
  const handleAddPeer = () => {
    if (!newPeerName.trim()) return;
    const nextIP = 10 + peers.length + 1;
    setPeers(prev => [...prev, {
      id: `peer-${Date.now()}`,
      name: newPeerName.trim(),
      publicKey: '',
      allowedIPs: `10.13.13.${nextIP}/32`,
      enabled: true,
    }]);
    setNewPeerName('');
    setShowAddPeer(false);
  };

  // Add pihole entry
  const handleAddDomain = () => {
    if (!newDomain.trim()) return;
    setPiholeEntries(prev => [...prev, {
      id: `ph-${Date.now()}`,
      domain: newDomain.trim().toLowerCase(),
      type: newDomainType,
      enabled: true,
    }]);
    setNewDomain('');
    setShowAddDomain(false);
  };

  const configuredExits = exits.filter(e => e.type === 'direct' || e.type === 'tor' || e.host);
  const unconfiguredExits = exits.filter(e => e.type === 'vps' && !e.host);

  return (
    <div style={{ padding: '20px', height: '100%', display: 'flex', flexDirection: 'column', background: '#1e1e2e' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexShrink: 0 }}>
        <h2 style={{ color: '#fff', margin: 0 }}>Network & VPN</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '10px', height: '10px', borderRadius: '50%',
            background: activeExit === 'direct' ? '#22c55e' : activeExit === 'tor' ? '#8b5cf6' : '#f59e0b',
          }} />
          <span style={{ color: '#ccc', fontSize: '13px' }}>
            {exits.find(e => e.id === activeExit)?.flag} {exits.find(e => e.id === activeExit)?.name || 'Direct'}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '16px', flexShrink: 0 }}>
        {([
          { id: 'vpn' as ActiveTab, label: '🔒 VPN Exits' },
          { id: 'peers' as ActiveTab, label: '👥 Peers' },
          { id: 'pihole' as ActiveTab, label: '🛡️ Pi-hole' },
          { id: 'dns' as ActiveTab, label: '🌐 DNS' },
        ]).map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            style={{
              background: activeTab === tab.id ? '#0070f3' : '#333', border: 'none',
              color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px',
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>

        {/* VPN EXITS TAB */}
        {activeTab === 'vpn' && (
          <>
            {/* Active Exits */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3 style={{ color: '#aaa', fontSize: '13px', textTransform: 'uppercase', margin: 0 }}>
                  Available Exit Nodes
                </h3>
                <button onClick={() => setShowAddExit(true)}
                  style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                  + Custom VPS
                </button>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '8px' }}>
                {configuredExits.map(exit => (
                  <div key={exit.id}
                    onClick={() => switchExit(exit.id)}
                    style={{
                      background: activeExit === exit.id ? '#0070f322' : '#2a2a3a',
                      border: activeExit === exit.id ? '2px solid #0070f3' : '1px solid #444',
                      padding: '14px', borderRadius: '8px', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                    }}>
                    <span style={{ fontSize: '28px' }}>{exit.flag}</span>
                    <span style={{ color: '#fff', fontWeight: 'bold', fontSize: '13px', marginTop: '6px' }}>{exit.name}</span>
                    <span style={{ color: '#666', fontSize: '10px' }}>
                      {exit.type === 'direct' ? 'No proxy' : exit.type === 'tor' ? 'Onion routing' : exit.host || 'VPS'}
                    </span>
                    {activeExit === exit.id && (
                      <span style={{ color: '#22c55e', fontSize: '10px', marginTop: '4px', fontWeight: 'bold' }}>ACTIVE</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Unconfigured — need VPS details */}
            {unconfiguredExits.length > 0 && (
              <div>
                <h3 style={{ color: '#aaa', fontSize: '13px', textTransform: 'uppercase', marginBottom: '12px' }}>
                  Available Locations — Click to configure VPS
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '6px' }}>
                  {unconfiguredExits.map(exit => (
                    <div key={exit.id}
                      onClick={() => configureExit(exit)}
                      style={{
                        background: '#222233', border: '1px dashed #555', padding: '10px',
                        borderRadius: '6px', cursor: 'pointer', textAlign: 'center',
                      }}>
                      <span style={{ fontSize: '22px' }}>{exit.flag}</span>
                      <div style={{ color: '#888', fontSize: '12px', marginTop: '4px' }}>{exit.name}</div>
                      <div style={{ color: '#555', fontSize: '10px' }}>Click to setup</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add Custom VPS Modal */}
            {showAddExit && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}
                onClick={() => setShowAddExit(false)}>
                <div style={{ background: '#2a2a3a', padding: '24px', borderRadius: '8px', width: '420px', border: '1px solid #444' }}
                  onClick={e => e.stopPropagation()}>
                  <h3 style={{ color: '#fff', marginTop: 0 }}>Add Custom VPS Exit</h3>
                  <input value={newExitName} onChange={e => setNewExitName(e.target.value)} placeholder="Name (e.g. My German VPS)"
                    style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px' }} />
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                    <input value={newExitCountry} onChange={e => setNewExitCountry(e.target.value)} placeholder="Country code (DE)"
                      style={{ width: '80px', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px' }} />
                    <input value={newExitFlag} onChange={e => setNewExitFlag(e.target.value)} placeholder="Flag emoji"
                      style={{ width: '60px', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px' }} />
                  </div>
                  <input value={newExitHost} onChange={e => setNewExitHost(e.target.value)} placeholder="VPS IP or hostname"
                    style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px' }} />
                  <input value={newExitPort} onChange={e => setNewExitPort(e.target.value)} placeholder="WireGuard port (51820)"
                    style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px' }} />
                  <input value={newExitKey} onChange={e => setNewExitKey(e.target.value)} placeholder="VPS WireGuard public key"
                    style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '16px' }} />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowAddExit(false)}
                      style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleAddExit}
                      style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* PEERS TAB */}
        {activeTab === 'peers' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ color: '#aaa', fontSize: '13px', textTransform: 'uppercase', margin: 0 }}>
                WireGuard Peers ({peers.length})
              </h3>
              <button onClick={() => setShowAddPeer(true)}
                style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                + Add Peer
              </button>
            </div>

            <div style={{ background: '#2a2a3a', borderRadius: '8px', overflow: 'hidden' }}>
              {peers.map(peer => (
                <div key={peer.id} style={{
                  display: 'flex', alignItems: 'center', padding: '14px 16px',
                  borderBottom: '1px solid #333', gap: '16px',
                }}>
                  <div style={{
                    width: '40px', height: '40px', borderRadius: '50%', background: '#333',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px',
                  }}>
                    {peer.name === 'Phone' ? '📱' : peer.name === 'Laptop' ? '💻' : peer.name === 'Tablet' ? '📱' : '🖥️'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#fff', fontWeight: 'bold', fontSize: '14px' }}>{peer.name}</div>
                    <div style={{ color: '#666', fontSize: '11px' }}>IP: {peer.allowedIPs}</div>
                    {peer.lastHandshake && (
                      <div style={{ color: '#888', fontSize: '10px' }}>Last seen: {peer.lastHandshake}</div>
                    )}
                    {peer.transferRx && (
                      <div style={{ color: '#888', fontSize: '10px' }}>↓ {peer.transferRx} ↑ {peer.transferTx}</div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button onClick={() => {
                      alert(`WireGuard config for "${peer.name}" will be generated on the server.\n\nRun on your HServer:\ndocker exec wireguard cat /config/peer_${peer.name.toLowerCase()}/peer_${peer.name.toLowerCase()}.conf`);
                    }}
                      style={{ background: '#333', border: 'none', color: '#ccc', padding: '6px 10px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                      📋 Config
                    </button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input type="checkbox" checked={peer.enabled}
                        onChange={() => setPeers(prev => prev.map(p => p.id === peer.id ? { ...p, enabled: !p.enabled } : p))} />
                      <span style={{ color: '#888', fontSize: '11px' }}>Active</span>
                    </label>
                    <button onClick={() => setPeers(prev => prev.filter(p => p.id !== peer.id))}
                      style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>✕</button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Peer Modal */}
            {showAddPeer && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}
                onClick={() => setShowAddPeer(false)}>
                <div style={{ background: '#2a2a3a', padding: '24px', borderRadius: '8px', width: '400px', border: '1px solid #444' }}
                  onClick={e => e.stopPropagation()}>
                  <h3 style={{ color: '#fff', marginTop: 0 }}>Add WireGuard Peer</h3>
                  <input value={newPeerName} onChange={e => setNewPeerName(e.target.value)} placeholder="Device name (e.g. Work Laptop)"
                    style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px' }} />
                  <p style={{ color: '#888', fontSize: '12px', marginBottom: '16px' }}>
                    After adding, the WireGuard container will generate a config file. Download it to the device and import into the WireGuard app.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowAddPeer(false)}
                      style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleAddPeer}
                      style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add Peer</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* PIHOLE TAB */}
        {activeTab === 'pihole' && (
          <>
            {/* Master Toggle */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: '#2a2a3a', padding: '16px', borderRadius: '8px' }}>
              <div>
                <div style={{ color: '#fff', fontWeight: 'bold' }}>Pi-hole Ad Blocking</div>
                <div style={{ color: '#666', fontSize: '12px' }}>Block ads and trackers across all devices</div>
              </div>
              <div onClick={() => setPiholeEnabled(!piholeEnabled)}
                style={{
                  width: '50px', height: '26px', borderRadius: '13px', cursor: 'pointer',
                  background: piholeEnabled ? '#22c55e' : '#555', position: 'relative', transition: 'background 0.2s',
                }}>
                <div style={{
                  width: '22px', height: '22px', borderRadius: '50%', background: '#fff',
                  position: 'absolute', top: '2px', transition: 'left 0.2s',
                  left: piholeEnabled ? '26px' : '2px',
                }} />
              </div>
            </div>

            {/* Domain Lists */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ color: '#aaa', fontSize: '13px', textTransform: 'uppercase', margin: 0 }}>
                Custom Domain Rules ({piholeEntries.length})
              </h3>
              <button onClick={() => setShowAddDomain(true)}
                style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
                + Add Domain
              </button>
            </div>

            {/* Preset Blocklists */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', marginBottom: '16px' }}>
              {[
                { name: 'Steven Black Unified', desc: 'Ads + malware + fakenews', entries: '180k', enabled: true },
                { name: 'OISD Full', desc: 'Comprehensive ad blocking', entries: '350k', enabled: false },
                { name: 'Energized Ultimate', desc: 'Aggressive blocking', entries: '700k', enabled: false },
                { name: 'Social Media Block', desc: 'Facebook, TikTok, Instagram trackers', entries: '5k', enabled: false },
                { name: 'Adult Content', desc: 'NSFW domain blocking', entries: '150k', enabled: false },
                { name: 'Gambling Sites', desc: 'Casino and betting domains', entries: '12k', enabled: false },
              ].map(list => (
                <div key={list.name} style={{
                  background: '#2a2a3a', padding: '12px', borderRadius: '6px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  border: '1px solid #444',
                }}>
                  <div>
                    <div style={{ color: '#fff', fontSize: '13px', fontWeight: 'bold' }}>{list.name}</div>
                    <div style={{ color: '#666', fontSize: '10px' }}>{list.desc} · {list.entries} domains</div>
                  </div>
                  <div onClick={() => { list.enabled = !list.enabled; }}
                    style={{
                      width: '40px', height: '22px', borderRadius: '11px', cursor: 'pointer',
                      background: list.enabled ? '#22c55e' : '#555', position: 'relative', flexShrink: 0,
                    }}>
                    <div style={{
                      width: '18px', height: '18px', borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: '2px', left: list.enabled ? '20px' : '2px',
                    }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Custom Entries */}
            <div style={{ background: '#2a2a3a', borderRadius: '8px', overflow: 'hidden' }}>
              {piholeEntries.length === 0 && (
                <div style={{ color: '#666', padding: '30px', textAlign: 'center' }}>No custom domain rules yet</div>
              )}
              {piholeEntries.map(entry => (
                <div key={entry.id} style={{
                  display: 'flex', alignItems: 'center', padding: '10px 16px',
                  borderBottom: '1px solid #333', gap: '12px',
                }}>
                  <span style={{
                    fontSize: '10px', padding: '2px 6px', borderRadius: '4px',
                    background: entry.type === 'blacklist' ? '#ef444422' : '#22c55e22',
                    color: entry.type === 'blacklist' ? '#ef4444' : '#22c55e',
                  }}>
                    {entry.type === 'blacklist' ? 'BLOCK' : 'ALLOW'}
                  </span>
                  <span style={{ flex: 1, color: '#ccc', fontSize: '13px', fontFamily: 'monospace' }}>{entry.domain}</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="checkbox" checked={entry.enabled}
                      onChange={() => setPiholeEntries(prev => prev.map(e => e.id === entry.id ? { ...e, enabled: !e.enabled } : e))} />
                    <span style={{ color: '#888', fontSize: '11px' }}>On</span>
                  </label>
                  <button onClick={() => setPiholeEntries(prev => prev.filter(e => e.id !== entry.id))}
                    style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </div>

            {/* Add Domain Modal */}
            {showAddDomain && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}
                onClick={() => setShowAddDomain(false)}>
                <div style={{ background: '#2a2a3a', padding: '24px', borderRadius: '8px', width: '400px', border: '1px solid #444' }}
                  onClick={e => e.stopPropagation()}>
                  <h3 style={{ color: '#fff', marginTop: 0 }}>Add Domain Rule</h3>
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                    <button onClick={() => setNewDomainType('blacklist')}
                      style={{ flex: 1, padding: '8px', background: newDomainType === 'blacklist' ? '#ef4444' : '#333', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}>
                      Block
                    </button>
                    <button onClick={() => setNewDomainType('whitelist')}
                      style={{ flex: 1, padding: '8px', background: newDomainType === 'whitelist' ? '#22c55e' : '#333', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer' }}>
                      Allow
                    </button>
                  </div>
                  <input value={newDomain} onChange={e => setNewDomain(e.target.value)} placeholder="Domain (e.g. ads.example.com)"
                    style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '16px', fontFamily: 'monospace' }} />
                  <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                    <button onClick={() => setShowAddDomain(false)}
                      style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
                    <button onClick={handleAddDomain}
                      style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Add</button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* DNS TAB */}
        {activeTab === 'dns' && (
          <div>
            <div style={{ background: '#2a2a3a', padding: '20px', borderRadius: '8px', marginBottom: '16px' }}>
              <h3 style={{ color: '#fff', marginTop: 0, marginBottom: '16px' }}>Dynamic DNS Configuration</h3>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {['duckdns', 'cloudflare', 'noip'].map(p => (
                  <button key={p} onClick={() => setDnsConfig(prev => ({ ...prev, provider: p }))}
                    style={{
                      background: dnsConfig.provider === p ? '#0070f3' : '#333', border: 'none',
                      color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer',
                      textTransform: 'capitalize', fontSize: '13px',
                    }}>
                    {p}
                  </button>
                ))}
              </div>
              <input value={dnsConfig.domain} onChange={e => setDnsConfig(prev => ({ ...prev, domain: e.target.value }))}
                placeholder={dnsConfig.provider === 'duckdns' ? 'yourdomain.duckdns.org' : 'yourdomain.com'}
                style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '10px', borderRadius: '4px', marginBottom: '8px' }} />
              <input value={dnsConfig.token} onChange={e => setDnsConfig(prev => ({ ...prev, token: e.target.value }))}
                placeholder="API Token / Secret" type="password"
                style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '10px', borderRadius: '4px', marginBottom: '12px' }} />
              <button onClick={() => alert('DNS config saved. Update your .env file with these values and restart DuckDNS container.')}
                style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '10px 24px', borderRadius: '6px', cursor: 'pointer' }}>
                Save DNS Config
              </button>
            </div>

            <div style={{ background: '#2a2a3a', padding: '20px', borderRadius: '8px' }}>
              <h3 style={{ color: '#fff', marginTop: 0 }}>Connection Info</h3>
              <div style={{ display: 'grid', gap: '8px' }}>
                {[
                  { label: 'Server IP', value: '10.10.0.1' },
                  { label: 'WireGuard Port', value: '51820/udp' },
                  { label: 'Pi-hole DNS', value: '10.10.0.53' },
                  { label: 'VPN Subnet', value: '10.13.13.0/24' },
                  { label: 'Frontend', value: 'https://10.10.0.1' },
                  { label: 'Backend API', value: 'https://10.10.0.1/api' },
                  { label: 'Grafana', value: 'https://10.10.0.1/grafana' },
                  { label: 'Jenkins', value: 'https://10.10.0.1/jenkins' },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #333' }}>
                    <span style={{ color: '#888', fontSize: '13px' }}>{item.label}</span>
                    <span style={{ color: '#fff', fontSize: '13px', fontFamily: 'monospace' }}>{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}