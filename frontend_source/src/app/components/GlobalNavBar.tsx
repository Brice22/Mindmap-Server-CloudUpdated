'use client';

import React from 'react';

interface GlobalNavBarProps {
  activeView: string;
  onViewChange: (view: string) => void;}

const NAV_ITEMS = [
  { id: 'graph', label: 'Graph', icon: '🔗' },
  { id: 'calendar', label: 'Calendar', icon: '📅' },
  { id: 'scheduler', label: 'Scheduler', icon: '📋' },
  { id: 'mindmap', label: 'Mind Map', icon: '🧠' },
  { id: 'finance', label: 'Finance', icon: '💰' },
  { id: 'newsfeed', label: 'Newsfeed', icon: '📰' },
  { id: 'quiz', label: 'Quiz Center', icon: '🧪' },

];

export default function GlobalNavBar({ activeView, onViewChange }: 
  GlobalNavBarProps) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      background: '#1a1a2e',
      borderBottom: '1px solid #333',
      padding: '0 12px',
      height: '40px',
      gap: '2px',
      flexShrink: 0,
    }}>
      {/* Logo / Home */}
      <div style={{
        fontWeight: 'bold',
        color: '#0070f3',
        marginRight: '16px',
        fontSize: '14px',
        cursor: 'pointer',
      }}
        onClick={() => onViewChange('graph')}
      >
        HServer
      </div>

      {/* Nav Items */}
      {NAV_ITEMS.map(item => (
        <button
          key={item.id}
          onClick={() => onViewChange(item.id)}
          style={{
            background: activeView === item.id ? '#333' : 'transparent',
            border: 'none',
            color: activeView === item.id ? '#fff' : '#888',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '13px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

    
    </div>
  );
}