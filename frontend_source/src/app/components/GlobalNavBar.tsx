'use client';

import React, { useState } from 'react';

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
  { id: 'health', label: 'Health', icon: '🏥' },
  { id: 'network', label: 'Network', icon: '🔒' },

];

export default function GlobalNavBar({ activeView, onViewChange }: GlobalNavBarProps) {
  const [expandedWidth, setExpandedWidth] = useState(120);

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
      {NAV_ITEMS.map(item => {
        const isActive = activeView === item.id;
        return (
          <div key={item.id} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
              onClick={() => onViewChange(item.id)}
              style={{
                background: isActive ? '#333' : 'transparent',
                border: 'none',
                color: isActive ? '#fff' : '#888',
                padding: '6px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                width: isActive ? `${expandedWidth}px` : 'auto',
                minWidth: 'fit-content',
                transition: 'width 0.2s',
              }}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </button>
            {/* Drag handle for active tab width */}
            {isActive && (
              <div
                style={{
                  width: '4px',
                  height: '28px',
                  cursor: 'col-resize',
                  background: '#555',
                  borderRadius: '2px',
                  marginLeft: '2px',
                  flexShrink: 0,
                }}
                onMouseDown={(e) => {
                  const startX = e.clientX;
                  const startW = expandedWidth;
                  const onMove = (ev: MouseEvent) => {
                    setExpandedWidth(Math.max(80, Math.min(250, startW + ev.clientX - startX)));
                  };
                  const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                  };
                  document.addEventListener('mousemove', onMove);
                  document.addEventListener('mouseup', onUp);
                }}
              />
            )}
          </div>
        );
      })}


      {/* Spacer */}
      <div style={{ flex: 1 }} />
    </div>
  );
}