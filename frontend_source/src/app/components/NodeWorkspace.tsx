// ============================================================
// NODE WORKSPACE - Multi-Panel Editor
// ============================================================
// PURPOSE: Full-screen workspace for editing a node with multiple panels.
//
// PANELS:
// - Etherpad: Rich text collaborative editing
// - Formula: KaTeX math notation
// - Chart: Chart.js, Desmos, GeoGebra embeds
//
// FEATURES:
// - Drag to resize panels
// - Minimize/maximize individual panels
// - Expand workspace to full screen
// - Back button to return to graph
//
// INSPIRED BY: Obsidian's panel system, VS Code's split editor
// ============================================================

'use client';

import React, { useState, useCallback } from 'react';
import type { Node, Panel } from '@/lib/types';
import ExcalidrawWrapper from './ExcalidrawWrapper';
import DocumentsPanel from './panels/DocumentsPanel';
import { NodeFormulaContext } from '@/lib/NodeFormulaContext';
import MapView from './MapView';


// ============================================================
// PROPS INTERFACE
// ============================================================

interface NodeWorkspaceProps {
  node: Node;
  onClose: () => void;
  onUpdateNode: (nodeId: number, updates: Partial<Node>) => void;
  etherpadBaseUrl?: string;
}

// ============================================================
// COMPONENT
// ============================================================
export default function NodeWorkspace({
  node,
  onClose,
  onUpdateNode,
  etherpadBaseUrl = '/etherpad',
}: NodeWorkspaceProps) {
  // --------------------------------------------------------
  // STATE
  // --------------------------------------------------------
    // Parse metadata (must come before panels state, which reads it)
  const meta = typeof node.metadata === 'string'
    ? JSON.parse(node.metadata)
    : node.metadata || {};
    // Latest metadata for this session — every save builds on this so saves don't overwrite each other
  const metaRef = React.useRef<any>(meta);
  const saveMeta = (patch: any) => {
    metaRef.current = { ...metaRef.current, ...patch };
    onUpdateNode(node.id, { metadata: metaRef.current } as any);
  };
  // Track which panels are open and their sizes
  const titles: Record<string, string> = {
    etherpad: 'Notes', formula: 'Formula', chart: 'Chart', preview: 'Preview',
    custom: 'Custom', excalidraw: 'Draw', map: 'Map', table: 'Table', docs: 'Docs',
  };

  const [panels, setPanels] = useState<Panel[]>(() => {
    if (meta.panelLayout && Array.isArray(meta.panelLayout)) {
            // Retired windows (math, charts and tables live in Docs now) — skip them in old saved layouts
      return meta.panelLayout.filter((p: any) => !['formula', 'chart', 'table'].includes(p.type)).map((p: any, i: number) => ({
      id: `${p.type}-${i}`,
        type: p.type,
        title: titles[p.type] || p.type,
        width: 50,
        position: p.position || { x: 20 + i * 30, y: 20 + i * 30 },
        size: p.size || { w: 500, h: 400 },
        zIndex: i + 1,
        minimized: !!p.minimized,
      }));
    }
         return [{ id: 'docs', type: 'docs', title: 'Docs', width: 60, position: { x: 20, y: 20 }, size: { w: 800, h: 550 }, zIndex: 1 }];
  });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [draggedPanel, setDraggedPanel] = useState<string | null>(null);
  const [dragOverPanel, setDragOverPanel] = useState<string | null>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

 // Save layout 0.8s after the last move/resize/open/close
  React.useEffect(() => {
    const t = setTimeout(() => {
      saveMeta({
        panelLayout: panels.map(p => ({ type: p.type, position: p.position, size: p.size, minimized: !!p.minimized })),
      });
    }, 800);
    return () => clearTimeout(t);
  }, [panels]);

  // --------------------------------------------------------
  // ADD PANEL
  // --------------------------------------------------------
  const addPanel = useCallback((type: Panel['type']) => {
   const titles: Record<Panel['type'], string> = {
      etherpad: 'Notes',
      formula: 'Formula',
      chart: 'Chart',
      preview: 'Preview',
      custom: 'Custom',
      excalidraw: 'Draw',
      map: 'Map',
      table: 'Table', docs: 'Docs',
    };

     // Toggle: if panel exists, remove it (closing the last one is allowed)
    if (panels.some(p => p.type === type)) {
      setPanels(prev => {
        const filtered = prev.filter(p => p.type !== type);
        const width = 100 / filtered.length;
        return filtered.map(p => ({ ...p, width }));
      });
      return;
    }

   const offset = panels.length * 30;
    const cRect = containerRef.current?.getBoundingClientRect();
       // Draw opens wider — Excalidraw switches to its cramped mobile toolbar below ~730px
    const defaultW = type === 'excalidraw'
      ? Math.min(1000, (cRect?.width || 1000) * 0.8)
      : Math.min(600, (cRect?.width || 800) * 0.5);
    const defaultH = type === 'excalidraw'
      ? Math.min(650, (cRect?.height || 700) * 0.85)
      : Math.min(500, (cRect?.height || 600) * 0.7);
    const newPanel: Panel = {
      id: `${type}-${Date.now()}`,
      type,
      title: titles[type],
      width: 50,
      position: { x: 20 + offset, y: 20 + offset },
      size: { w: defaultW, h: defaultH },
      zIndex: Math.max(...panels.map(p => p.zIndex || 1), 0) + 1,
    };

    setPanels(prev => [...prev, newPanel]);
       
  }, [panels]);

  // --------------------------------------------------------
  // REMOVE PANEL
  // --------------------------------------------------------
  const removePanel = useCallback((panelId: string) => {
    setPanels(prev => {
      const filtered = prev.filter(p => p.id !== panelId);
      // Redistribute widths
      const width = 100 / filtered.length;
      return filtered.map(p => ({ ...p, width }));
    });
  }, []);

  // --------------------------------------------------------
  // TOGGLE MINIMIZE
  // --------------------------------------------------------
  const toggleMinimize = useCallback((panelId: string) => {
    setPanels(prev => prev.map(p => 
      p.id === panelId ? { ...p, minimized: !p.minimized, maximized: false } : p
    ));
  }, []);

  // --------------------------------------------------------
  // TOGGLE MAXIMIZE
  // --------------------------------------------------------
   const toggleMaximize = useCallback((panelId: string) => {
    setPanels(prev => prev.map(p => 
      p.id === panelId 
        ? { ...p, maximized: !p.maximized, minimized: false } 
        : p
    ));
  }, []);

  // --------------------------------------------------------
  // SAVE FORMULA
  // --------------------------------------------------------
   // Formula shown on the graph node — set by a math block's "Show on node" button
  const [nodeFormula, setNodeFormula] = useState<string>(meta.formula || '');
   // Table shown on the graph node — set from a table's ⠿ menu in Docs
  const [nodeTable, setNodeTable] = useState<any>(meta.tableData || null);
  const nodeFormulaCtx = React.useMemo(() => ({
    formula: nodeFormula,
    setFormula: (latex: string | null) => {
      setNodeFormula(latex || '');
      saveMeta({ formula: latex });   // null removes it from the node
    },
    tableData: nodeTable,
    setTableData: (table: any) => {
      setNodeTable(table);
      saveMeta({ tableData: table });  // null removes it from the node
    },
  }), [nodeFormula, nodeTable]);

 

 

  // ============================================================
  // RENDER PANEL CONTENT
  // ============================================================
  const renderPanelContent = (panel: Panel) => {
    switch (panel.type) {
      case 'etherpad':
        return (
          <iframe
            src={`${etherpadBaseUrl}/p/node_${node.id}?showChat=true&showLineNumbers=true`}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: '#1e1e1e',
            }}
            title="Etherpad Editor"
          />
        );

    

    

      case 'excalidraw':
        return (
         <ExcalidrawWrapper
            onSave={(excalidrawData: any) => saveMeta({ excalidrawData })}
            initialData={metaRef.current.excalidrawData}
          />
        );

     case 'map':
        return (
          <MapView
            key={`map-${panel.id}`}
            nodes={[node]}
            markers={(meta.mapMarkers || [])}
            onAddMarker={(nodeId, lat, lng) => {
              const markers = [...(metaRef.current.mapMarkers || []), { nodeId, lat, lng }];
              saveMeta({ mapMarkers: markers });
            }}
            onNodeClick={() => {}}
          />
        );

            case 'docs':
        return (
          <NodeFormulaContext.Provider value={nodeFormulaCtx}>
            <DocumentsPanel
              nodeId={node.id}
              legacy={metaRef.current.legacyImported ? undefined : {
                tableData: metaRef.current.tableData,
                chartConfig: metaRef.current.chartConfig,
              }}
              onLegacyImported={() => saveMeta({ chartConfig: null, legacyImported: true })}
            />
          </NodeFormulaContext.Provider>
        );
     

      default:
        return <div>Unknown panel type</div>;
    }
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div
      style={{
       position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: isFullscreen ? 1000 : 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e1e',
        height: '100vh',
      }}
    >
      {/* ======================================================== */}
      {/* HEADER BAR */}
      {/* ======================================================== */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '8px 16px',
          background: '#252526',
          borderBottom: '1px solid #333',
        }}
      >
        {/* Left: Back button and title */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={onClose}
            style={{
              background: '#333',
              border: 'none',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
            }}
          >
            ← Graph
          </button>
          <h2 style={{ margin: 0, color: '#fff', fontSize: '16px' }}>
            {node.name}
          </h2>
        </div>

        {/* Center: Panel buttons */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => addPanel('etherpad')}
            style={{
              background: panels.some(p => p.type === 'etherpad') ? '#0070f3' : '#333',
              border: 'none',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            📝 Notes
          </button>
          
          
           <button
            onClick={() => addPanel('excalidraw')}
            style={{
              background: panels.some(p => p.type === 'excalidraw') ? '#0070f3' : '#333',
              border: 'none',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            ✏️ Draw
          </button>
                    <button
            onClick={() => addPanel('map')}
            style={{
              background: panels.some(p => p.type === 'map') ? '#0070f3' : '#333',
              border: 'none',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            🗺️ Map
          </button>
         
          <button
            onClick={() => addPanel('docs')}
            style={{
              background: panels.some(p => p.type === 'docs') ? '#0070f3' : '#333',
              border: 'none',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            📄 Docs
          </button>
        </div>

        {/* Right: Fullscreen toggle */}
       <div style={{ display: 'flex', gap: '8px' }}>
          
          <button
            onClick={() => {
              if (!isFullscreen) {
                document.documentElement.requestFullscreen?.();
              } else {
                document.exitFullscreen?.();
              }
              setIsFullscreen(!isFullscreen);
            }}
            style={{
              background: '#333',
              border: 'none',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {isFullscreen ? '⊙ Exit Fullscreen' : '⤢ Fullscreen'}
          </button>
        </div>
      </div>

      {/* ======================================================== */}
      {/* PANELS CONTAINER — Floating Windows */}
      {/* ======================================================== */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          background: '#1a1a2e',
        }}
      >
            {panels.filter(p => !p.minimized).length === 0 && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: 14 }}>
            No windows open — pick one from the toolbar above
          </div>
        )}
        {panels.filter(p => !p.minimized).map((panel) => {
          const maximizedPanel = panels.find(p => p.maximized && !p.minimized);
          if (maximizedPanel && panel.id !== maximizedPanel.id) return null;

          const pos = panel.position || { x: 20, y: 20 };
          const size = panel.size || { w: 500, h: 400 };

          return (
            <div
              key={panel.id}
              style={{
                position: maximizedPanel ? 'absolute' : 'absolute',
                left: maximizedPanel ? 0 : pos.x,
                top: maximizedPanel ? 0 : pos.y,
                width: maximizedPanel ? '100%' : size.w,
                height: maximizedPanel ? '100%' : size.h,
                display: 'flex',
                flexDirection: 'column',
                background: '#1e1e1e',
                border: maximizedPanel ? 'none' : '1px solid #444',
                borderRadius: maximizedPanel ? 0 : '6px',
                boxShadow: maximizedPanel ? 'none' : '0 4px 20px rgba(0,0,0,0.5)',
                zIndex: panel.zIndex || 1,
                overflow: 'hidden',
              }}
              onClick={() => {
                const maxZ = Math.max(...panels.map(p => p.zIndex || 1));
                if ((panel.zIndex || 1) < maxZ) {
                  setPanels(prev => prev.map(p =>
                    p.id === panel.id ? { ...p, zIndex: maxZ + 1 } : p
                  ));
                }
              }}
            >
              {/* Window Title Bar — draggable */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  background: '#333',
                  borderBottom: '1px solid #444',
                  cursor: 'grab',
                  userSelect: 'none',
                  borderRadius: maximizedPanel ? 0 : '6px 6px 0 0',
                }}
                onMouseDown={(e) => {
                  if (maximizedPanel) return;
                  e.preventDefault();
                  const startX = e.clientX - pos.x;
                  const startY = e.clientY - pos.y;
                  const maxZ = Math.max(...panels.map(p => p.zIndex || 1));
                  setPanels(prev => prev.map(p =>
                    p.id === panel.id ? { ...p, zIndex: maxZ + 1 } : p
                  ));
                  const onMove = (ev: MouseEvent) => {
                    const cRect = containerRef.current?.getBoundingClientRect();
                    if (!cRect) return;
                    const newX = Math.max(0, Math.min(cRect.width - 100, ev.clientX - startX));
                    const newY = Math.max(0, Math.min(cRect.height - 40, ev.clientY - startY));
                    setPanels(prev => prev.map(p =>
                      p.id === panel.id ? { ...p, position: { x: newX, y: newY } } : p
                    ));
                  };
                  const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                  };
                  document.addEventListener('mousemove', onMove);
                  document.addEventListener('mouseup', onUp);
                }}
              >
                <span style={{ color: '#ccc', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: '#555' }}>⠿</span>
                  {panel.title}
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button onClick={() => toggleMinimize(panel.id)}
                    style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '2px 6px', fontSize: '12px' }}
                    title="Minimize">_</button>
                  <button onClick={() => toggleMaximize(panel.id)}
                    style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '2px 6px', fontSize: '12px' }}
                    title={panel.maximized ? 'Restore' : 'Maximize'}>{panel.maximized ? '❐' : '□'}</button>
                  <button onClick={() => removePanel(panel.id)}
                    style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', padding: '2px 6px', fontSize: '12px' }}
                    title="Close">×</button>
                </div>
              </div>

              {/* Panel Content */}
             {/* isolation: keeps Excalidraw/Leaflet z-indexes inside the window so they can't cover the resize handle */}
              <div style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative', isolation: 'isolate' }}>
                {renderPanelContent(panel)}
              </div>

              {/* Resize handle — bottom right corner */}
              {!maximizedPanel && (
                <div
                  style={{
                    position: 'absolute', bottom: 0, right: 0, zIndex: 10,
                    width: '16px', height: '16px', cursor: 'nwse-resize',
                  }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const startX = e.clientX;
                    const startY = e.clientY;
                    const startW = size.w;
                    const startH = size.h;
                    const maxZ = Math.max(...panels.map(p => p.zIndex || 1));
                    setPanels(prev => prev.map(p =>
                      p.id === panel.id ? { ...p, zIndex: maxZ + 1 } : p
                    ));
                    const onMove = (ev: MouseEvent) => {
                      const newW = Math.max(200, startW + (ev.clientX - startX));
                      const newH = Math.max(150, startH + (ev.clientY - startY));
                      setPanels(prev => prev.map(p =>
                        p.id === panel.id ? { ...p, size: { w: newW, h: newH } } : p
                      ));
                    };
                    const onUp = () => {
                      document.removeEventListener('mousemove', onMove);
                      document.removeEventListener('mouseup', onUp);
                    };
                    document.addEventListener('mousemove', onMove);
                    document.addEventListener('mouseup', onUp);
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" style={{ opacity: 0.4 }}>
                    <path d="M14 2L2 14M14 6L6 14M14 10L10 14" stroke="#888" strokeWidth="1.5" fill="none"/>
                  </svg>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* MINIMIZED PANELS BAR */}
      {/* ======================================================== */}
      {panels.some(p => p.minimized) && (
        <div style={{
          display: 'flex', gap: '4px', padding: '4px 8px',
          background: '#252526', borderTop: '1px solid #333',
        }}>
          {panels.filter(p => p.minimized).map(panel => (
            <button key={panel.id} onClick={() => toggleMinimize(panel.id)}
              style={{
                background: '#333', border: 'none', color: '#ccc',
                padding: '4px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
              }}>
              {panel.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
