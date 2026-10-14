// ============================================================
// CONTEXT MENU - Right-Click Menu Component
// ============================================================
// PURPOSE: Shows a menu when user right-clicks on a node.
//
// FEATURES:
// - Open in new tab
// - Open workspace (multi-panel editor)
// - Add child node
// - Set/change parent
// - Edit link text
// - Remove parent link
// - Collapse/Expand children
// - Pin node (always visible)
// - Add formula (KaTeX)
// - Add chart
// - Delete node
//
// USAGE:
// <ContextMenu
//   x={mouseX}
//   y={mouseY}
//   node={rightClickedNode}
//   onClose={() => setMenuOpen(false)}
//   onAction={handleAction}
// />
// ============================================================

'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { Node } from '@/lib/types';

// ============================================================
// MENU ITEM INTERFACE
// ============================================================
interface MenuItem {
  label: string;
  icon?: string;
  action: string;        // Action identifier passed to onAction
  disabled?: boolean;
  danger?: boolean;      // Red text for destructive actions
  divider?: boolean;     // Show divider after this item
}

// ============================================================
// PROPS INTERFACE
// ============================================================
interface ContextMenuProps {
  x: number;                    // Mouse X position
  y: number;                    // Mouse Y position
  node: Node;                   // The node that was right-clicked
  allNodes: Node[];             // All nodes (to check for orphans)
  onClose: () => void;          // Called when menu should close
  onAction: (action: string, node: Node) => void;  // Called when item clicked
}

// ============================================================
// COMPONENT
// ============================================================
export default function ContextMenu({
  x,
  y,
  node,
  allNodes,
  onClose,
  onAction,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [submenu, setSubmenu] = useState<string | null>(null);


  // --------------------------------------------------------
  // PARSE METADATA
  // --------------------------------------------------------
  const meta = typeof node.metadata === 'string'
    ? JSON.parse(node.metadata)
    : node.metadata || {};

  // Check if node has orphaned parent
  const hasOrphan = meta.parent && !allNodes.some(
    n => n.name.toLowerCase() === meta.parent.toLowerCase()
  );

  // --------------------------------------------------------
  // CLICK OUTSIDE TO CLOSE
  // --------------------------------------------------------
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as HTMLElement)) {
        onClose();
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  // --------------------------------------------------------
  // MENU ITEMS
  // --------------------------------------------------------
  const menuItems: MenuItem[] = [
    // === OPEN ACTIONS ===
    { label: '📂 Open in Tab', icon: '📂', action: 'openTab' },
    { label: '🪟 Open Workspace', icon: '🪟', action: 'openWorkspace', divider: true },
    
    // === NODE OPERATIONS ===
    { label: '➕ Add Child', icon: '➕', action: 'addChild' },
    { label: '🔗 Set Parent...', icon: '🔗', action: 'setParent' },
    { 
      label: '✏️ Edit Link Text', 
      icon: '✏️', 
      action: 'editLinkText',
      disabled: !meta.parent,  // Only if has parent
    },
    { 
      label: '❌ Remove Parent Link', 
      icon: '❌', 
      action: 'removeParent',
      disabled: !meta.parent,
      divider: true,
    },

    // === ORPHAN WARNING ===
    ...(hasOrphan ? [{
      label: '⚠️ Remove Invalid Link',
      icon: '⚠️',
      action: 'removeOrphan',
      danger: true,
      divider: true,
    }] : []),

    // === VIEW OPTIONS ===
    { 
      label: meta.collapsed ? '👁️ Expand Children' : '👁️ Collapse Children', 
      icon: '👁️', 
      action: 'toggleCollapse' 
    },
    { 
      label: meta.pinned ? '📌 Unpin' : '📌 Pin (Always Visible)', 
      icon: '📌', 
      action: 'togglePin',
      divider: true,
    },
    
    {
      label: '⭐ Bookmark',
      action: 'bookmark',
      divider: false,
   },
  // === APPEARANCE ===
    {
      label: `🔷 Shape ►`,
      action: 'submenu_shape',
    },
    {
      label: `📐 Size ►`,
      action: 'submenu_size',
      divider: true,
    },

    // === FEATURES ===
    { label: '∑ Add Formula', icon: '∑', action: 'addFormula' },
    { label: '📊 Add Chart', icon: '📊', action: 'addChart', divider: true },
    { label: '✏️ Add Whiteboard', icon: '✏️', action: 'addExcalidraw' },
    { label: '🗺️ Add Map', icon: '🗺️', action: 'addMap', divider: true },

    // === STATUS ===
    {
      label: meta.todoStatus === 'done' ? '✅ Mark Incomplete' : meta.todoStatus === 'in-progress' ? '✅ Mark Done' : meta.todoStatus === 'todo' ? '🔄 In Progress' : '☐ Mark To-Do',
      action: 'cycleTodoStatus',
      divider: true,
    },
    {
      label: meta.quizEnabled ? '🧪 Remove from Quiz' : '🧪 Add to Quiz Pool',
      action: 'toggleQuizEnabled',
    },

    // === DANGER ZONE ===
    { label: '🗑️ Delete Node', icon: '🗑️', action: 'delete', danger: true },
  ];

  // --------------------------------------------------------
  // HANDLE CLICK
  // --------------------------------------------------------
 const handleItemClick = (item: MenuItem) => {
    if (item.disabled) return;
    if (item.action.startsWith('submenu_')) {
      setSubmenu(submenu === item.action ? null : item.action);
      return;
    }
    onAction(item.action, node);
    onClose();
  };

  // --------------------------------------------------------
  // POSITION ADJUSTMENT
  // --------------------------------------------------------
  // Keep menu on screen
  let adjustedX = x;
  let adjustedY = y;
  
  // Adjust if near right edge
 if (typeof window !== 'undefined') {
    if (x + 220 > window.innerWidth) {
      adjustedX = window.innerWidth - 230;
    }
    if (y + 500 > window.innerHeight) {
      adjustedY = Math.max(10, window.innerHeight - 510);
    }
  }

  // ============================================================
  // RENDER
  // ============================================================
 return (
    <>
    <div
      onClick={onClose}
      onContextMenu={(e) => { e.preventDefault(); onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
      }}
    />
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        left: adjustedX,
        top: adjustedY,
        zIndex: 9999,
        background: '#2d2d2d',
        border: '1px solid #444',
        borderRadius: '8px',
        padding: '6px 0',
        minWidth: '200px',
        maxHeight: `calc(100vh - ${adjustedY + 20}px)`,
        overflowY: 'auto',
        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
      }}
    >
      {/* Header showing node name */}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid #444',
          color: '#aaa',
          fontSize: '12px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}
      >
        <span>{node.name}</span>
        {hasOrphan && (
          <span
            style={{
              background: '#f97316',
              color: '#fff',
              padding: '2px 6px',
              borderRadius: '4px',
              fontSize: '10px',
            }}
          >
            ⚠️ Orphan
          </span>
        )}
      </div>

      {/* Menu Items */}
      {menuItems.map((item, index) => (
        <React.Fragment key={item.action}>
          <div
            onClick={() => handleItemClick(item)}
            style={{
              padding: '8px 12px',
              cursor: item.disabled ? 'not-allowed' : 'pointer',
              color: item.disabled 
                ? '#666' 
                : item.danger 
                  ? '#ef4444' 
                  : '#eee',
              opacity: item.disabled ? 0.5 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '13px',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => {
              if (!item.disabled) {
                e.currentTarget.style.background = '#3d3d3d';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            {item.label}
          </div>
          
          {/* Shape submenu */}
          {item.action === 'submenu_shape' && submenu === 'submenu_shape' && (
            <div style={{ background: '#252525', padding: '4px 0', margin: '0 8px', borderRadius: '4px' }}>
              {['circle', 'rectangle', 'diamond', 'hexagon'].map(shape => (
                <div key={shape} onClick={() => { onAction(`setShape_${shape}`, node); onClose(); }}
                  style={{
                    padding: '6px 16px', cursor: 'pointer', fontSize: '12px',
                    color: (meta.shape || 'circle') === shape ? '#0070f3' : '#ccc',
                    fontWeight: (meta.shape || 'circle') === shape ? 'bold' : 'normal',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#3d3d3d'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  {shape === 'circle' ? '⭕' : shape === 'rectangle' ? '⬜' : shape === 'diamond' ? '🔷' : '⬡'} {shape}
                </div>
              ))}
            </div>
          )}
          {/* Size submenu */}
          {item.action === 'submenu_size' && submenu === 'submenu_size' && (
            <div style={{ background: '#252525', padding: '4px 0', margin: '0 8px', borderRadius: '4px' }}>
              {['small', 'medium', 'large'].map(size => (
                <div key={size} onClick={() => { onAction(`setSize_${size}`, node); onClose(); }}
                  style={{
                    padding: '6px 16px', cursor: 'pointer', fontSize: '12px',
                    color: (meta.nodeSize || 'medium') === size ? '#0070f3' : '#ccc',
                    fontWeight: (meta.nodeSize || 'medium') === size ? 'bold' : 'normal',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#3d3d3d'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}>
                  {size === 'small' ? '🔹' : size === 'medium' ? '🔸' : '🔶'} {size}
                </div>
              ))}
            </div>
          )}
          {item.divider && (
            <div
              style={{
                height: '1px',
                background: '#444',
                margin: '4px 8px',
              }}
            />
          )}
        </React.Fragment>
      ))}
    </div>
    </>
  );
}
