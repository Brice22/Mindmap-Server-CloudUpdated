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
import FormulaPanel from './panels/FormulaPanel';
import ChartPanel from './panels/ChartPanel';
import ExcalidrawWrapper from './ExcalidrawWrapper';
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
  // Track which panels are open and their sizes
  const [panels, setPanels] = useState<Panel[]>([
    { id: 'etherpad', type: 'etherpad', title: 'Notes', width: 60 },
  ]);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [draggedPanel, setDraggedPanel] = useState<string | null>(null);
  const [dragOverPanel, setDragOverPanel] = useState<string | null>(null);

  // Parse metadata
  const meta = typeof node.metadata === 'string'
    ? JSON.parse(node.metadata)
    : node.metadata || {};

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
    };

    // Check if panel already exists
    if (panels.some(p => p.type === type)) {
      // Just un-minimize it
      setPanels(prev => prev.map(p => 
        p.type === type ? { ...p, minimized: false } : p
      ));
      return;
    }

    // Add new panel, redistribute widths
    const newPanel: Panel = {
      id: `${type}-${Date.now()}`,
      type,
      title: titles[type],
      width: 40,
    };

    setPanels(prev => {
      const newPanels = [...prev, newPanel];
      // Redistribute widths evenly
      const width = 100 / newPanels.length;
      return newPanels.map(p => ({ ...p, width }));
    });
  }, [panels]);

  // --------------------------------------------------------
  // REMOVE PANEL
  // --------------------------------------------------------
  const removePanel = useCallback((panelId: string) => {
    setPanels(prev => {
      const filtered = prev.filter(p => p.id !== panelId);
      // Redistribute widths
      if (filtered.length === 0) return prev; // Keep at least one
      const width = 100 / filtered.length;
      return filtered.map(p => ({ ...p, width }));
    });
  }, []);

  // --------------------------------------------------------
  // TOGGLE MINIMIZE
  // --------------------------------------------------------
  const toggleMinimize = useCallback((panelId: string) => {
    setPanels(prev => prev.map(p => 
      p.id === panelId ? { ...p, minimized: !p.minimized } : p
    ));
  }, []);

  // --------------------------------------------------------
  // TOGGLE MAXIMIZE
  // --------------------------------------------------------
  const toggleMaximize = useCallback((panelId: string) => {
    setPanels(prev => prev.map(p => 
      p.id === panelId 
        ? { ...p, maximized: !p.maximized } 
        : { ...p, maximized: false }  // Un-maximize others
    ));
  }, []);

  // --------------------------------------------------------
  // SAVE FORMULA
  // --------------------------------------------------------
  const saveFormula = useCallback((formula: string) => {
    onUpdateNode(node.id, {
      metadata: { ...meta, formula },
    } as any);
  }, [node.id, meta, onUpdateNode]);

  // --------------------------------------------------------
  // SAVE CHART CONFIG
  // --------------------------------------------------------
  const saveChartConfig = useCallback((chartConfig: any) => {
    onUpdateNode(node.id, {
      metadata: { ...meta, chartConfig },
    } as any);
  }, [node.id, meta, onUpdateNode]);

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

      case 'formula':
        return (
          <FormulaPanel
            formula={meta.formula || ''}
            onSave={saveFormula}
          />
        );

      case 'chart':
        return (
          <ChartPanel
            config={meta.chartConfig}
            onSave={saveChartConfig}
          />
        );

      case 'excalidraw':
        return (
          <ExcalidrawWrapper
            onSave={(excalidrawData: any) => {
              onUpdateNode(node.id, {
                metadata: { ...meta, excalidrawData },
              } as any);
            }}
            initialData={meta.excalidrawData}
          />
        );

      case 'map':
        return (
          <MapView
            nodes={[node]}
            markers={(meta.mapMarkers || [])}
            onAddMarker={(nodeId, lat, lng) => {
              const markers = [...(meta.mapMarkers || []), { nodeId, lat, lng }];
              onUpdateNode(node.id, { metadata: { ...meta, mapMarkers: markers } } as any);
            }}
            onNodeClick={() => {}}
          />
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
        position: isFullscreen ? 'fixed' : 'relative',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: isFullscreen ? 1000 : 1,
        display: 'flex',
        flexDirection: 'column',
        background: '#1e1e1e',
        height: '100%',
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
            onClick={() => addPanel('formula')}
            style={{
              background: panels.some(p => p.type === 'formula') ? '#0070f3' : '#333',
              border: 'none',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            ∑ Formula
          </button>
          <button
            onClick={() => addPanel('chart')}
            style={{
              background: panels.some(p => p.type === 'chart') ? '#0070f3' : '#333',
              border: 'none',
              color: '#fff',
              padding: '6px 12px',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            📊 Chart
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
        </div>

        {/* Right: Fullscreen toggle */}
        <button
          onClick={() => setIsFullscreen(!isFullscreen)}
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

      {/* ======================================================== */}
      {/* PANELS CONTAINER */}
      {/* ======================================================== */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          overflow: 'hidden',
        }}
      >
        {panels.filter(p => !p.minimized).map((panel, index) => {
          // If one panel is maximized, only show that one
          const maximizedPanel = panels.find(p => p.maximized);
          if (maximizedPanel && panel.id !== maximizedPanel.id) {
            return null;
          }

          return (
            <React.Fragment key={panel.id}>
            <div
              draggable
              onDragStart={(e) => {
                setDraggedPanel(panel.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverPanel(panel.id);
              }}
              onDragLeave={() => setDragOverPanel(null)}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedPanel && draggedPanel !== panel.id) {
                  setPanels(prev => {
                    const newPanels = [...prev];
                    const fromIdx = newPanels.findIndex(p => p.id === draggedPanel);
                    const toIdx = newPanels.findIndex(p => p.id === panel.id);
                    const [moved] = newPanels.splice(fromIdx, 1);
                    newPanels.splice(toIdx, 0, moved);
                    return newPanels;
                  });
                }
                setDraggedPanel(null);
                setDragOverPanel(null);
              }}
              onDragEnd={() => { setDraggedPanel(null); setDragOverPanel(null); }}
              style={{
                flex: maximizedPanel ? 1 : `0 0 ${panel.width}%`,
                display: 'flex',
                flexDirection: 'column',
                borderRight: index < panels.length - 1 ? '1px solid #333' : 'none',
                overflow: 'hidden',
                opacity: draggedPanel === panel.id ? 0.5 : 1,
                borderLeft: dragOverPanel === panel.id && draggedPanel !== panel.id ? '3px solid #0070f3' : 'none',
                transition: 'opacity 0.2s',
              }}
            >
              {/* Panel Header */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 8px',
                  background: '#333',
                  borderBottom: '1px solid #444',
                }}
              >
                <span style={{ color: '#ccc', fontSize: '12px', cursor: 'grab', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: '#555', fontSize: '10px' }}>⠿</span>
                  {panel.title}
                </span>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => toggleMinimize(panel.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#888',
                      cursor: 'pointer',
                      padding: '2px 6px',
                    }}
                    title="Minimize"
                  >
                    _
                  </button>
                  <button
                    onClick={() => toggleMaximize(panel.id)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#888',
                      cursor: 'pointer',
                      padding: '2px 6px',
                    }}
                    title="Maximize"
                  >
                    □
                  </button>
                  {panels.length > 1 && (
                    <button
                      onClick={() => removePanel(panel.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#888',
                        cursor: 'pointer',
                        padding: '2px 6px',
                      }}
                      title="Close"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>

              {/* Panel Content */}
              <div style={{ flex: 1, overflow: 'auto' }}>
                {renderPanelContent(panel)}
              </div>
            </div>
            {/* Resize handle between panels */}
            {!maximizedPanel && index < panels.filter(p => !p.minimized).length - 1 && (
              <div
                style={{
                  width: '5px', cursor: 'col-resize', background: '#333',
                  flexShrink: 0, transition: 'background 0.2s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#0070f3'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#333'; }}
                onMouseDown={(e) => {
                  const startX = e.clientX;
                  const panelsCopy = [...panels];
                  const visiblePanels = panelsCopy.filter(p => !p.minimized);
                  const leftPanel = visiblePanels[index];
                  const rightPanel = visiblePanels[index + 1];
                  const startLeftWidth = leftPanel.width;
                  const startRightWidth = rightPanel.width;

                  const onMove = (ev: MouseEvent) => {
                    const containerWidth = (e.currentTarget.parentElement?.clientWidth || 800);
                    const deltaPercent = ((ev.clientX - startX) / containerWidth) * 100;
                    const newLeft = Math.max(15, Math.min(85, startLeftWidth + deltaPercent));
                    const newRight = Math.max(15, Math.min(85, startRightWidth - deltaPercent));

                    setPanels(prev => prev.map(p => {
                      if (p.id === leftPanel.id) return { ...p, width: newLeft };
                      if (p.id === rightPanel.id) return { ...p, width: newRight };
                      return p;
                    }));
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
            </React.Fragment>
          );
        })}
      </div>

      {/* ======================================================== */}
      {/* MINIMIZED PANELS BAR */}
      {/* ======================================================== */}
      {panels.some(p => p.minimized) && (
        <div
          style={{
            display: 'flex',
            gap: '4px',
            padding: '4px 8px',
            background: '#252526',
            borderTop: '1px solid #333',
          }}
        >
          {panels.filter(p => p.minimized).map(panel => (
            <button
              key={panel.id}
              onClick={() => toggleMinimize(panel.id)}
              style={{
                background: '#333',
                border: 'none',
                color: '#ccc',
                padding: '4px 12px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '12px',
              }}
            >
              {panel.title}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
