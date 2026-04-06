// ============================================================
// PAGE.TSX - Main Dashboard
// ============================================================
// PURPOSE: The main entry point for the mindmap application.
// This component orchestrates all the features:
//
// COMPONENTS:
// - MindMapGraph: The visual graph (D3.js)
// - ContextMenu: Right-click menu
// - NodeWorkspace: Multi-panel editor
// - NodeModal: Create/edit dialogs
//
// STATE MANAGED:
// - nodes: All mindmap nodes from the database
// - tabs: Browser-like tabs (Graph, Node editors)
// - selectedNode: Currently selected node
// - contextMenu: Right-click menu state
// - modal: Modal dialog state
//
// API ENDPOINTS:
// - GET /api/mindmap - Fetch all nodes
// - POST /api/mindmap/node - Create node
// - PUT /api/mindmap/node/:id - Update node
// - DELETE /api/mindmap/node/:id - Delete node
// ============================================================

'use client';

import { useState, useEffect, useCallback } from 'react';
import MindMapGraph from './MindMapGraph';
import ContextMenu from './components/ContextMenu';
import NodeWorkspace from './components/NodeWorkspace';
import NodeModal from './components/NodeModal';
import GlobalNavBar from './components/GlobalNavBar';
import BookmarkPanel from './components/BookmarkPanel';
import UnifiedSearchBar from './components/UnifiedSearchBar';
import CalendarView from './components/CalendarView';
import MindmapHub from './components/MindmapHub';
import FinanceView from './components/FinanceView';
import SchedulerView from './components/SchedulerView';
import HealthView from './components/HealthView';
import NewsfeedView from './components/NewsfeedView';
import QuizCenter from './components/QuizCenter';
import NetworkPanel from './components/NetworkPanel';
import type { Node, Tab, Bookmark, CalendarEvent, FilterOptions, MindmapCollection } from '@/lib/types';

// ============================================================
// API BASE URL
// ============================================================
// In production, this comes from environment variable.
// The /api prefix is handled by nginx routing.
// ============================================================
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function Dashboard() {
  // --------------------------------------------------------
  // STATE: Data
  // --------------------------------------------------------
  const [nodes, setNodes] = useState<Node[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // --------------------------------------------------------
  // STATE: UI
  // --------------------------------------------------------
  const [tabs, setTabs] = useState<Tab[]>([
    { id: 'graph', title: 'Graph Overview', type: 'graph' },
  ]);
  const [activeTabId, setActiveTabId] = useState('graph');
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [filterType, setFilterType] = useState('all');

  // --------------------------------------------------------
  // STATE: Context Menu
  // --------------------------------------------------------
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    node: Node | null;
  }>({ visible: false, x: 0, y: 0, node: null });

  // --------------------------------------------------------
  // STATE: Modal
  // --------------------------------------------------------
  const [modal, setModal] = useState<{
    visible: boolean;
    mode: 'create' | 'setParent' | 'editLinkText';
    node?: Node;
  }>({ visible: false, mode: 'create' });

  // --------------------------------------------------------
  // STATE: Workspace
  // --------------------------------------------------------
  const [workspaceNode, setWorkspaceNode] = useState<Node | null>(null);

  // --------------------------------------------------------
  // STATE: New Features
  // --------------------------------------------------------
  const [activeView, setActiveView] = useState('graph');
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
  const [collections, setCollections] = useState<MindmapCollection[]>([]);
  const [filters, setFilters] = useState<FilterOptions>({ sortBy: 'name', sortDir: 'asc' });
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(250);
  const [rightPanelWidth, setRightPanelWidth] = useState(300);

  // Load persisted data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [bm, ev, col] = await Promise.allSettled([
          fetch(`${API_URL}/api/mindmap/bookmarks`).then(r => r.ok ? r.json() : []),
          fetch(`${API_URL}/api/mindmap/events`).then(r => r.ok ? r.json() : []),
          fetch(`${API_URL}/api/mindmap/collections`).then(r => r.ok ? r.json() : []),
        ]);
        if (bm.status === 'fulfilled') setBookmarks(bm.value.map((b: any) => ({
          id: String(b.id), nodeId: b.node_id, nodeName: b.node_name, createdAt: b.created_at, color: b.color, group: b.group_name,
        })));
        if (ev.status === 'fulfilled') setCalendarEvents(ev.value.map((e: any) => ({
          id: String(e.id), title: e.title, start: e.start_time, end: e.end_time, nodeId: e.node_id, color: e.color,
        })));
        if (col.status === 'fulfilled') setCollections(col.value.map((c: any) => ({
          id: String(c.id), name: c.name, icon: c.icon, description: c.description, nodeIds: c.node_ids || [], createdAt: c.created_at,
        })));
      } catch { /* Backend not available */ }
    };
    loadData();
  }, []);
  // ============================================================
  // FETCH NODES
  // ============================================================
  // Loads all nodes from the backend API.
  // Called on mount and after any create/update/delete.
  // ============================================================
  const fetchNodes = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Add cache-busting timestamp
      const res = await fetch(`${API_URL}/api/mindmap?t=${Date.now()}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }

      const data = await res.json();
      console.log('[Dashboard] Fetched', data.length, 'nodes');
      setNodes(data);
    } catch (e: any) {
      console.error('[Dashboard] Fetch error:', e);
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    fetchNodes();
  }, [fetchNodes]);

  // Listen for edge right-click
  useEffect(() => {
    const handler = (e: any) => {
      const node = e.detail;
      if (node) setModal({ visible: true, mode: 'editLinkText', node });
    };
    window.addEventListener('editLinkText', handler);
    return () => window.removeEventListener('editLinkText', handler);
  }, []);


  // ============================================================
  // CREATE NODE
  // ============================================================
  const createNode = useCallback(async (data: {
    name: string;
    description: string;
    type: string;
    parent?: string;
  }) => {
    try {
      const res = await fetch(`${API_URL}/api/mindmap/node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.name,
          description: data.description,
          type: data.type,
          metadata: {
            type: data.type,
            parent: data.parent || '',
            source: 'dashboard',
          },
        }),
      });

      if (!res.ok) throw new Error('Failed to create node');

      const newNode = await res.json();
      console.log('[Dashboard] Created node:', newNode);

      // Refresh and open the new node
      await fetchNodes();
      openNodeTab(newNode);
    } catch (e) {
      console.error('[Dashboard] Create error:', e);
    }
  }, [fetchNodes]);

  // ============================================================
  // UPDATE NODE
  // ============================================================
  const updateNode = useCallback(async (nodeId: number, updates: Partial<Node>) => {
    try {
      const res = await fetch(`${API_URL}/api/mindmap/node/${nodeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error('Failed to update node');

      console.log('[Dashboard] Updated node:', nodeId);
      await fetchNodes();
    } catch (e) {
      console.error('[Dashboard] Update error:', e);
    }
  }, [fetchNodes]);

  // ============================================================
  // DELETE NODE
  // ============================================================
  const deleteNode = useCallback(async (nodeId: number) => {
    if (!confirm('Are you sure you want to delete this node?')) return;

    try {
      const res = await fetch(`${API_URL}/api/mindmap/node/${nodeId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to delete node');

      console.log('[Dashboard] Deleted node:', nodeId);

      // Close any tabs for this node
      setTabs(prev => prev.filter(t => t.nodeId !== nodeId));

      // Clear selection if this was selected
      if (selectedNode?.id === nodeId) {
        setSelectedNode(null);
      }

      await fetchNodes();
    } catch (e) {
      console.error('[Dashboard] Delete error:', e);
    }
  }, [fetchNodes, selectedNode]);

  // ============================================================
  // TAB MANAGEMENT
  // ============================================================
  const openNewTab = () => {
    const newId = `new-${Date.now()}`;
    const newTab: Tab = { id: newId, title: 'New Page', type: 'new' };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(newId);
  };

  const openNodeTab = (node: Node) => {
    const existing = tabs.find(t => t.nodeId === node.id);
    if (existing) {
      setActiveTabId(existing.id);
    } else {
      const newTab: Tab = {
        id: `node-${node.id}`,
        title: node.name,
        type: 'node',
        nodeId: node.id,
      };
      setTabs(prev => [...prev, newTab]);
      setActiveTabId(newTab.id);
    }
  };

  const closeTab = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.id !== tabId);
    setTabs(newTabs);

    if (activeTabId === tabId && newTabs.length > 0) {
      setActiveTabId(newTabs[newTabs.length - 1].id);
    }
  };

  // ============================================================
  // GRAPH EVENT HANDLERS
  // ============================================================
  const handleNodeClick = (node: Node) => {
    console.log('[Dashboard] Node clicked:', node.name);
    setSelectedNode(node);
    if (!rightPanelOpen) setRightPanelOpen(true);
  };

  const handleNodeDoubleClick = (node: Node) => {
    console.log('[Dashboard] Node double-clicked:', node.name);
    setWorkspaceNode(node);
  };

  const handleContextMenu = (e: React.MouseEvent, node: Node) => {
    e.preventDefault();
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      node,
    });
  };

  // ============================================================
  // CONTEXT MENU ACTIONS
  // ============================================================
  const handleContextAction = async (action: string, node: Node) => {
    const meta = typeof node.metadata === 'string'
      ? JSON.parse(node.metadata)
      : node.metadata || {};

    switch (action) {
      case 'openTab':
        openNodeTab(node);
        break;

      case 'openWorkspace':
        setWorkspaceNode(node);
        break;

      case 'addChild':
        setModal({ visible: true, mode: 'create', node });
        break;

      case 'setParent':
        setModal({ visible: true, mode: 'setParent', node });
        break;

      case 'editLinkText':
        setModal({ visible: true, mode: 'editLinkText', node });
        break;

      case 'removeParent':
      case 'removeOrphan':
        await updateNode(node.id, {
          metadata: { ...meta, parent: '' },
        } as any);
        break;

      case 'toggleCollapse':
        await updateNode(node.id, {
          metadata: { ...meta, collapsed: !meta.collapsed },
        } as any);
        break;

      case 'togglePin':
        await updateNode(node.id, {
          metadata: { ...meta, pinned: !meta.pinned },
        } as any);
        break;

      case 'addFormula':
        setWorkspaceNode(node);
        // WorkSpace will handle adding formula panel
        break;

      case 'addChart':
        setWorkspaceNode(node);
        // WorkSpace will handle adding chart panel
        break;

     

      case 'addExcalidraw':
        setWorkspaceNode(node);
        break;

      case 'addMap':
        setWorkspaceNode(node);
        break;

      case 'bookmark': {
        const exists = bookmarks.find(b => b.nodeId === node.id);
        if (!exists) {
          try {
            const res = await fetch(`${API_URL}/api/mindmap/bookmarks`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ nodeId: node.id, nodeName: node.name }),
            });
            if (res.ok) {
              const bm = await res.json();
              setBookmarks(prev => [...prev, { id: String(bm.id), nodeId: bm.node_id, nodeName: bm.node_name, createdAt: bm.created_at }]);
            }
          } catch {
            setBookmarks(prev => [...prev, { id: `bm-${Date.now()}`, nodeId: node.id, nodeName: node.name, createdAt: new Date().toISOString() }]);
          }
        } else {
          try {
            await fetch(`${API_URL}/api/mindmap/bookmarks/${exists.id}`, { method: 'DELETE' });
          } catch {}
          setBookmarks(prev => prev.filter(b => b.nodeId !== node.id));
        }
        break;
      }
   
        case 'cycleTodoStatus': {
        const statusCycle: Record<string, string> = {
          'none': 'todo', 'undefined': 'todo', 'todo': 'in-progress', 'in-progress': 'done', 'done': 'none'
        };
        const current = meta.todoStatus || 'none';
        await updateNode(node.id, {
          metadata: { ...meta, todoStatus: statusCycle[current] || 'todo' },
        } as any);
        break;
      }

      case 'toggleQuizEnabled':
        await updateNode(node.id, {
          metadata: { ...meta, quizEnabled: !meta.quizEnabled },
        } as any);
        break;

      case 'delete':
        await deleteNode(node.id);
        break;
    }

    setContextMenu({ visible: false, x: 0, y: 0, node: null });
  };

  // ============================================================
  // MODAL SUBMIT HANDLERS
  // ============================================================
  const handleModalSubmit = async (data: any) => {
    if (modal.mode === 'create') {
      await createNode(data);
    } else if (modal.mode === 'setParent') {
      await updateNode(data.nodeId, {
        metadata: { parent: data.parentName },
      } as any);
    } else if (modal.mode === 'editLinkText') {
      const node = nodes.find(n => n.id === data.nodeId);
      if (node) {
        const meta = typeof node.metadata === 'string'
          ? JSON.parse(node.metadata)
          : node.metadata || {};
        await updateNode(data.nodeId, {
          metadata: { ...meta, linkText: data.linkText },
        } as any);
      }
    }

    setModal({ visible: false, mode: 'create' });
  };

  // ============================================================
  // DERIVED STATE
  // ============================================================
  const activeTab = tabs.find(t => t.id === activeTabId);

  // Calculate backlinks for selected node
  const backlinks = selectedNode
    ? nodes.filter(n => {
        const m = typeof n.metadata === 'string'
          ? JSON.parse(n.metadata)
          : n.metadata || {};
        return m.parent && m.parent.toLowerCase() === selectedNode.name.toLowerCase();
      })
    : [];

  // ============================================================
  // RENDER: WORKSPACE MODE
  // ============================================================
  if (workspaceNode) {
    return (
      <NodeWorkspace
        node={workspaceNode}
        onClose={() => setWorkspaceNode(null)}
        onUpdateNode={updateNode}
        etherpadBaseUrl={`${API_URL}/etherpad`}
      />
    );
  }

  // ============================================================
  // RENDER: MAIN DASHBOARD
  // ============================================================
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: 'Inter, system-ui, sans-serif',
        background: '#1e1e1e',
        color: '#ccc',
      }}
    >
      {/* GLOBAL NAV BAR */}
      <GlobalNavBar
        activeView={activeView}
        onViewChange={setActiveView}
      />


      {/* TAB BAR */}
      <div
        style={{
          display: 'flex',
          background: '#252526',
          borderBottom: '1px solid #000',
          alignItems: 'flex-end',
        }}
      >
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            style={{
              padding: '8px 15px',
              background: activeTabId === tab.id ? '#1e1e1e' : '#2d2d2d',
              borderRight: '1px solid #111',
              borderTop: activeTabId === tab.id ? '2px solid #0070f3' : '2px solid transparent',
              cursor: 'pointer',
              display: 'flex',
              gap: '8px',
              alignItems: 'center',
              color: activeTabId === tab.id ? '#fff' : '#888',
              borderRadius: '5px 5px 0 0',
              marginRight: '2px',
            }}
          >
            {tab.title}
            {tab.id !== 'graph' && (
              <span
                onClick={(e) => closeTab(e, tab.id)}
                style={{ fontSize: '1.2rem', lineHeight: 0.5 }}
              >
                ×
              </span>
            )}
          </div>
        ))}
        <div
          onClick={openNewTab}
          style={{
            padding: '8px 15px',
            cursor: 'pointer',
            color: '#888',
            fontSize: '1.2rem',
            background: '#2d2d2d',
            borderRadius: '5px 5px 0 0',
          }}
        >
          +
        </div>
      </div>

      {/* MAIN CONTENT AREA */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* LEFT SIDEBAR — Bookmarks + Filters */}
        {leftSidebarOpen && (
          <>
            <div style={{
              width: leftSidebarWidth,
              flexShrink: 0,
              borderRight: '1px solid #333',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
            }}>
              
              <div style={{ flex: 1, overflow: 'auto' }}>
                <BookmarkPanel
                  bookmarks={bookmarks}
                  onSelectNode={(id) => {
                    const n = nodes.find(nd => nd.id === id);
                    if (n) {
                      setSelectedNode(n);
                      setActiveView('graph');
                    }
                  }}
                  onRemoveBookmark={async (id) => {
                    try { await fetch(`${API_URL}/api/mindmap/bookmarks/${id}`, { method: 'DELETE' }); } catch {}
                    setBookmarks(prev => prev.filter(b => b.id !== id));
                  }}
               />
              </div>
            </div>
            {/* Left sidebar drag handle */}
            <div
              style={{ width: '4px', cursor: 'col-resize', background: '#333', flexShrink: 0 }}
              onMouseDown={(e) => {
                const startX = e.clientX;
                const startW = leftSidebarWidth;
                const onMove = (ev: MouseEvent) => {
                  setLeftSidebarWidth(Math.max(150, Math.min(500, startW + ev.clientX - startX)));
                };
                const onUp = () => {
                  document.removeEventListener('mousemove', onMove);
                  document.removeEventListener('mouseup', onUp);
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
              }}
            />
          </>
        )}
        {!leftSidebarOpen && (
          <div
            onClick={() => setLeftSidebarOpen(true)}
            style={{
              width: '24px', background: '#252526', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#666', borderRight: '1px solid #333', flexShrink: 0,
            }}
            title="Open sidebar"
          >
            »
          </div>
        )}

        {/* CENTER — View Router */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        
        {/* UNIFIED SEARCH + FILTER + SORT BAR */}
          <UnifiedSearchBar
            filters={filters}
            onFilterChange={setFilters}
            nodeTypes={['person', 'medical', 'concept', 'location']}
            allNodes={nodes}
            onSelectNode={(node) => { setSelectedNode(node); setActiveView('graph'); if (!rightPanelOpen) setRightPanelOpen(true); }}
          />
          {/* GRAPH VIEW */}
          {activeView === 'graph' && (
            <>
              {activeTab?.type === 'graph' && (
                <>
                  

                  {/* Graph */}
                  <div style={{ flex: 1, position: 'relative' }}
                    onContextMenu={(e) => {
                      // Only if clicking the background (not a node)
                      if ((e.target as HTMLElement).tagName === 'svg' || (e.target as HTMLElement).closest('svg') === e.target) {
                        e.preventDefault();
                        setModal({ visible: true, mode: 'create' });
                      }
                    }}
                  >
                    {isLoading ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <span>Loading...</span>
                      </div>
                    ) : error ? (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#ef4444' }}>
                        <span>Error: {error}</span>
                      </div>
                    ) : (
                      <MindMapGraph
                        data={nodes}
                        onNodeClick={handleNodeClick}
                        onNodeDoubleClick={handleNodeDoubleClick}
                        selectedNodeId={selectedNode?.id || null}
                        filterType={filterType}
                      />
                    )}
                  </div>
                </>
              )}

              {activeTab?.type === 'new' && (
                <div style={{ padding: '50px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <h1 style={{ color: '#eee' }}>What do you want to create?</h1>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginTop: '30px' }}>
                    {[
                      { type: 'person', icon: '👤', title: 'Person', desc: 'Bio, Relationships, History' },
                      { type: 'medical', icon: '🏥', title: 'Medical Model', desc: 'Anatomy, Symptoms, Notes' },
                      { type: 'concept', icon: '💡', title: 'Concept', desc: 'Generic Idea or Note' },
                    ].map(template => (
                      <div
                        key={template.type}
                        onClick={() => setModal({ visible: true, mode: 'create' })}
                        style={{
                          background: '#333', padding: '30px', borderRadius: '8px',
                          cursor: 'pointer', textAlign: 'center', border: '1px solid #444',
                        }}
                      >
                        <h3 style={{ margin: 0, fontSize: '32px' }}>{template.icon}</h3>
                        <h4 style={{ margin: '10px 0 5px', color: '#fff' }}>{template.title}</h4>
                        <p style={{ margin: 0, color: '#888', fontSize: '14px' }}>{template.desc}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab?.type === 'node' && (
                <iframe
                  src={`${API_URL}/etherpad/p/node_${activeTab.nodeId}?showChat=true&showLineNumbers=true`}
                  style={{ flex: 1, width: '100%', border: 'none' }}
                  title="Etherpad"
                />
              )}
            </>
          )}

          {/* CALENDAR VIEW */}
          {activeView === 'calendar' && (
            <CalendarView
              events={calendarEvents}
              onEventClick={(ev) => {
                if (ev.nodeId) {
                  const n = nodes.find(nd => nd.id === ev.nodeId);
                  if (n) setSelectedNode(n);
                }
              }}
              onDateClick={async (date) => {
                const title = 'New Event';
                try {
                  const res = await fetch(`${API_URL}/api/mindmap/events`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, start: date }),
                  });
                  if (res.ok) {
                    const ev = await res.json();
                    setCalendarEvents(prev => [...prev, { id: String(ev.id), title: ev.title, start: ev.start_time, color: ev.color }]);
                    return;
                  }
                } catch {}
                setCalendarEvents(prev => [...prev, { id: `ev-${Date.now()}`, title, start: date }]);
              }}
            />
          )}

        {/* MINDMAP HUB */}
          {activeView === 'mindmap' && (
            <MindmapHub
              collections={collections}
              nodes={nodes}
              onCreateCollection={async (col) => {
                try {
                  const res = await fetch(`${API_URL}/api/mindmap/collections`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(col),
                  });
                  if (res.ok) {
                    const saved = await res.json();
                    setCollections(prev => [...prev, { ...col, id: String(saved.id) }]);
                    return;
                  }
                } catch {}
                setCollections(prev => [...prev, col]);
              }}
              onOpenCollection={(col) => {
                console.log('Open collection:', col.name, col.nodeIds);
              }}
              onDeleteCollection={async (id) => {
                try { await fetch(`${API_URL}/api/mindmap/collections/${id}`, { method: 'DELETE' }); } catch {}
                setCollections(prev => prev.filter(c => c.id !== id));
              }}
            />
          )}

          {/* SCHEDULER VIEW */}
          {activeView === 'scheduler' && (
            <SchedulerView
              events={calendarEvents}
              onAddEvent={async (ev) => {
                try {
                  const res = await fetch(`${API_URL}/api/mindmap/events`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: ev.title, start: ev.start, end: ev.end, color: ev.color }),
                  });
                  if (res.ok) {
                    const saved = await res.json();
                    setCalendarEvents(prev => [...prev, { id: String(saved.id), title: saved.title, start: saved.start_time, end: saved.end_time, color: saved.color }]);
                    return;
                  }
                } catch {}
                setCalendarEvents(prev => [...prev, ev]);
              }}
              onDeleteEvent={async (id) => {
                try { await fetch(`${API_URL}/api/mindmap/events/${id}`, { method: 'DELETE' }); } catch {}
                setCalendarEvents(prev => prev.filter(e => e.id !== id));
              }}
              onUpdateEvent={async (id, updates) => {
                try {
                  await fetch(`${API_URL}/api/mindmap/events/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updates),
                  });
                } catch {}
                setCalendarEvents(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
              }}
           />
          )}

          {/* MIND MAP VIEW */}
          {activeView === 'mindmap' && (
            <div style={{ padding: '40px', textAlign: 'center', color: '#666' }}>
              <h2 style={{ color: '#fff' }}>Mind Map (Tree View)</h2>
              <p>Hierarchical tree layout of your nodes. Coming soon.</p>
            </div>
          )}

          

         {/* FINANCE VIEW */}
          {activeView === 'finance' && (
           <FinanceView
              apiUrl={API_URL}
              onAddToCalendar={async (title, date, color) => {
                try {
                  const res = await fetch(`${API_URL}/api/mindmap/events`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, start: date, color }),
                  });
                  if (res.ok) {
                    const ev = await res.json();
                    setCalendarEvents(prev => [...prev, { id: String(ev.id), title, start: date, color }]);
                    return;
                  }
                } catch {}
                setCalendarEvents(prev => [...prev, { id: `fin-${Date.now()}`, title, start: date, color }]);
              }}
            />
          )}

          {/* NEWSFEED VIEW */}
          {activeView === 'newsfeed' && (
            <NewsfeedView
              onSaveToMindmap={(title, url) => {
                createNode({ name: title, description: url, type: 'concept', parent: '' });
              }}
            />
          )}

          {/* QUIZ CENTER VIEW */}
          {activeView === 'quiz' && (
            <QuizCenter
              nodes={nodes}
              apiUrl={API_URL}
              onOpenNode={(node) => { setSelectedNode(node); setActiveView('graph'); }}
            />
          )}
        </div>

        {activeView === 'health' && (
            <HealthView
              apiUrl={API_URL}
              onAddToCalendar={async (title, date, color) => {
                try {
                  const res = await fetch(`${API_URL}/api/mindmap/events`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title, start: date, color }),
                  });
                  if (res.ok) {
                    const ev = await res.json();
                    setCalendarEvents(prev => [...prev, { id: String(ev.id), title, start: date, color }]);
                    return;
                  }
                } catch {}
                setCalendarEvents(prev => [...prev, { id: `health-${Date.now()}`, title, start: date, color }]);
              }}
            />
          )}

          {activeView === 'network' && (
            <NetworkPanel />
          )}

        {/* Right panel drag handle */}
        {rightPanelOpen && (
          <div
            style={{ width: '4px', cursor: 'col-resize', background: '#333', flexShrink: 0 }}
            onMouseDown={(e) => {
              const startX = e.clientX;
              const startW = rightPanelWidth;
              const onMove = (ev: MouseEvent) => {
                setRightPanelWidth(Math.max(200, Math.min(600, startW - (ev.clientX - startX))));
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

        {/* RIGHT PANEL (Inspector) */}
        {rightPanelOpen ? (
          <div
            style={{
              width: rightPanelWidth,
              flexShrink: 0,
              background: '#252526',
              borderLeft: '1px solid #000',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <div
              style={{
                padding: '10px',
                background: '#333',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 'bold', color: 'white' }}>Inspector</span>
              <button
                onClick={() => setRightPanelOpen(false)}
                style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer' }}
              >
                Close »
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }}>
              {selectedNode ? (
                <>
                  <h2 style={{ marginTop: 0, color: 'white' }}>{selectedNode.name}</h2>
                  <button
                    onClick={() => handleNodeDoubleClick(selectedNode)}
                    style={{
                      width: '100%',
                      padding: '8px',
                      marginBottom: '15px',
                      background: '#0070f3',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    Open in Workspace
                  </button>

                  {/* Backlinks */}
                  <div
                    style={{
                      marginBottom: '20px',
                      background: '#111',
                      padding: '10px',
                      borderRadius: '8px',
                    }}
                  >
                    <h4 style={{ margin: '0 0 10px 0', color: '#aaa' }}>
                      Linked Mentions (Backlinks)
                    </h4>
                    {backlinks.length > 0 ? (
                      backlinks.map(bn => (
                        <div
                          key={bn.id}
                          onClick={() => handleNodeClick(bn)}
                          style={{
                            padding: '5px',
                            borderBottom: '1px solid #333',
                            cursor: 'pointer',
                            color: '#0070f3',
                          }}
                        >
                          ↳ {bn.name}
                        </div>
                      ))
                    ) : (
                      <div style={{ fontStyle: 'italic', color: '#666' }}>
                        No nodes link here yet.
                      </div>
                    )}
                  </div>

                  {/* Quick Notes */}
                  <h4 style={{ margin: '0 0 10px 0' }}>Quick Notes</h4>
                  <iframe
                    src={`${API_URL}/etherpad/p/node_${selectedNode.id}?showChat=false&showLineNumbers=false&showControls=false`}
                    style={{
                      width: '100%',
                      height: '300px',
                      border: '1px solid #444',
                      borderRadius: '4px',
                    }}
                    title="Quick Notes"
                  />
                </>
              ) : (
                <div style={{ color: '#666', textAlign: 'center', marginTop: '50px' }}>
                  Select a node to inspect.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div
            onClick={() => setRightPanelOpen(true)}
            style={{
              width: '30px',
              background: '#333',
              borderLeft: '1px solid #555',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ccc',
            }}
            title="Open Inspector"
          >
            «
          </div>
        )}
      </div>

      {/* CONTEXT MENU */}
      {contextMenu.visible && contextMenu.node && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          node={contextMenu.node}
          allNodes={nodes}
          onClose={() => setContextMenu({ visible: false, x: 0, y: 0, node: null })}
          onAction={handleContextAction}
        />
      )}

      {/* MODAL */}
      {modal.visible && (
        <NodeModal
          mode={modal.mode}
          node={modal.node}
          allNodes={nodes}
          onClose={() => setModal({ visible: false, mode: 'create' })}
          onSubmit={handleModalSubmit}
        />
      )}
    </div>
  );
}