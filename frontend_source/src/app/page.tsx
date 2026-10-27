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

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import MindMapGraph from './MindMapGraph';
import ContextMenu from './components/ContextMenu';
import NodeWorkspace from './components/NodeWorkspace';
import NotesPreview from './components/NotesPreview';
import BacklinksPanel from './components/BacklinksPanel';
import NodePhotoPanel from './components/NodePhotoPanel';
import DocumentsPanel from './components/panels/DocumentsPanel';
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
import TrashView from './components/TrashView';
import FilesPanel, { FilePreview } from './components/FilesPanel';
import LinkDialog from './components/LinkDialog';
import LinkLegend from './components/LinkLegend';
import GraphToolsPanel, { type GraphToolMode, type GraphHighlight } from './components/GraphToolsPanel';
import { isOwner } from './components/AuthGate';
import LabelsDialog from './components/labels/LabelsDialog';
import LessonPlanPanel from './components/labels/LessonPlanPanel';
import { ROLES, roleOf, tagsOf, type Tag } from '@/lib/labels';
import type { Node, Tab, Bookmark, CalendarEvent, FilterOptions, MindmapCollection, Panel, LinkType, NodeLink, GraphLink } from '@/lib/types';
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
  const [filterType, setFilterType] = useState(() => {   // graph filter: all · role:knowledge · tag:CNC · a node type
    try { return localStorage.getItem('hserver:graphFilter') || 'all'; } catch { return 'all'; }
  });
  const changeFilter = (v: string) => { setFilterType(v); try { localStorage.setItem('hserver:graphFilter', v); } catch {} };

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
  const [workspaceOpenPanel, setWorkspaceOpenPanel] = useState<Panel['type'] | undefined>(undefined);
  const [quizFocusNodeId, setQuizFocusNodeId] = useState<number | null>(null);   // "🧪 Study this node" → its deck in Quiz Center
  const [previewFile, setPreviewFile] = useState<{ file: any; page?: number | null } | null>(null);   // file opened from search / Backlinks

    // Open a document (from search) in its node's Docs window
    const openDocument = (docId: number, nodeId: number | null) => {
      const home = nodes.find(n => n.id === nodeId);
      if (!home) { alert('This document is Unfiled. Open any node → Docs → 🔗 Link existing to give it a home.'); return; }
      try { localStorage.setItem(`hserver:doc:${home.id}`, String(docId)); } catch {}   // Docs opens the remembered document
      setWorkspaceOpenPanel('docs');
      setWorkspaceNode(home);
    };

  // --------------------------------------------------------
  // STATE: Backlinks (dashed link lines on the graph + Inspector refresh)
  // --------------------------------------------------------
  const [linkEdges, setLinkEdges] = useState<{ source: number; target: number; kind: 'link' | 'mention' }[]>([]);
  const [showLinkLines, setShowLinkLines] = useState(true);
  const [backlinksRefresh, setBacklinksRefresh] = useState(0);
  // 🔗 Your links between nodes + their link types
  const [linkData, setLinkData] = useState<{ types: LinkType[]; links: NodeLink[] }>({ types: [], links: [] });
  const [linksRefresh, setLinksRefresh] = useState(0);
  const [linkDialog, setLinkDialog] = useState<{ source?: Node; link?: NodeLink } | null>(null);
    // 🧭 Graph tools (Neo4j): which question is open, and what to light up on the graph
  const [graphTool, setGraphTool] = useState<{ mode: GraphToolMode; node: Node } | null>(null);
  const [graphHighlight, setGraphHighlight] = useState<GraphHighlight | null>(null);
  // 🏷 Tags (name + colour), and the Role & tags dialog / lesson plan that are open
  const [tags, setTags] = useState<Tag[]>([]);
  const [tagsRefresh, setTagsRefresh] = useState(0);
  const [labelsNode, setLabelsNode] = useState<Node | null>(null);
  const [lessonPlanId, setLessonPlanId] = useState<number | null>(null);
  const [hiddenLinkTypes, setHiddenLinkTypes] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('hserver:hiddenLinkTypes') || '[]')); } catch { return new Set(); }
  });
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

  // Keep the selected node in sync with the latest data, so the Inspector (and
  // "Open in Workspace" from it) never works from an old copy of the node
   useEffect(() => {
    setSelectedNode(prev => (prev ? nodes.find(n => n.id === prev.id) || prev : prev));
  }, [nodes]);

  // Backlink lines for the graph — reloaded whenever nodes reload or the workspace closes
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`${API_URL}/api/mindmap/backlinks/edges`)
        .then(r => (r.ok ? r.json() : []))
        .then(setLinkEdges)
        .catch(() => {});
       }, 500);
    return () => clearTimeout(t);
  }, [nodes, backlinksRefresh]);

  // 🔗 Your links — reloaded when nodes reload (a deleted node takes its links with it) or a link changes
  const reloadLinks = useCallback(() => setLinksRefresh(n => n + 1), []);
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`${API_URL}/api/mindmap/links`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (d) setLinkData({ types: d.types || [], links: d.links || [] }); })
        .catch(() => {});
    }, 300);
       return () => clearTimeout(t);
  }, [nodes, linksRefresh]);

  // 🏷 Tags — reloaded when nodes reload (their counts) or a tag changes
  const reloadTags = useCallback(() => setTagsRefresh(n => n + 1), []);
  useEffect(() => {
    const t = setTimeout(() => {
      fetch(`${API_URL}/api/mindmap/tags`)
        .then(r => (r.ok ? r.json() : null))
        .then(d => { if (Array.isArray(d)) setTags(d); })
        .catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [nodes, tagsRefresh]);
  const tagColors = useMemo(() => Object.fromEntries(tags.map(t => [t.name, t.color])), [tags]);

  const toggleLinkType = useCallback((key: string) => {
    setHiddenLinkTypes(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      try { localStorage.setItem('hserver:hiddenLinkTypes', JSON.stringify(Array.from(next))); } catch {}
      return next;
    });
  }, []);

  // What the graph draws: each link with its type's colour / dash / arrow, minus hidden types
  const graphLinks = useMemo<GraphLink[]>(() => {
    const byId = new Map(linkData.types.map(t => [t.id, t]));
    return linkData.links
      .filter(l => !hiddenLinkTypes.has(l.typeId == null ? 'none' : String(l.typeId)))
      .map(l => {
        const t = l.typeId == null ? undefined : byId.get(l.typeId);
        return {
          id: l.id, source: l.sourceId, target: l.targetId, label: l.label || '',
          color: t?.color || '#9ca3af', dashed: t?.dashed ?? false, arrow: t?.arrow ?? false, typeName: t?.name || 'No type',
        };
      });
  }, [linkData, hiddenLinkTypes]);

  // Right-click on one of your link lines → edit it
  useEffect(() => {
    const handler = (e: any) => {
      const link = linkData.links.find(l => l.id === e.detail?.linkId);
      if (link) setLinkDialog({ link });
    };
    window.addEventListener('editCustomLink', handler);
    return () => window.removeEventListener('editCustomLink', handler);
  }, [linkData]);
  
  // --------------------------------------------------------
  // Remember where you were (in this browser): view, selected node, open workspace.
  // A refresh puts you back there. (Graph zoom and the open doc are remembered too.)
  // --------------------------------------------------------
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || nodes.length === 0) return;
    restoredRef.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem('hserver:ui') || 'null');
      if (!saved) return;
      if (saved.view) setActiveView(saved.view);
      const sel = nodes.find(n => n.id === saved.selectedId);
      if (sel) setSelectedNode(sel);
      const ws = nodes.find(n => n.id === saved.workspaceId);
      if (ws) setWorkspaceNode(ws);
      if (typeof saved.rightPanelOpen === 'boolean') setRightPanelOpen(saved.rightPanelOpen);
    } catch {}
  }, [nodes]);

  useEffect(() => {
    if (!restoredRef.current) return;   // don't overwrite the saved spot before it's been restored
    try {
      localStorage.setItem('hserver:ui', JSON.stringify({
        view: activeView,
        selectedId: selectedNode?.id ?? null,
        workspaceId: workspaceNode?.id ?? null,
        rightPanelOpen,
      }));
    } catch {}
  }, [activeView, selectedNode?.id, workspaceNode?.id, rightPanelOpen]);

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
    if (!confirm('Move this node to the Trash? You can restore it (with its documents) for 30 days.')) return;
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
  const handleNodeClick = (node: Node | null) => {
    if (!node || !node.id) {
      setSelectedNode(null);
      return;
    }
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

      case 'addLink':
        setLinkDialog({ source: node });
        break;

      case 'graphBefore':
        setGraphTool({ mode: 'before', node });
        break;

      case 'graphGoals':
        setGraphTool({ mode: 'goals', node });
        break;

      case 'graphPath':
        setGraphTool({ mode: 'path', node });
        break;

      case 'graphNear':
                setGraphTool({ mode: 'near', node });
        break;

      case 'labels':
        setLabelsNode(node);
        break;

      case 'openLessonPlan':
        setLessonPlanId(node.id);
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

       case 'addDocs':
        setWorkspaceOpenPanel('docs');
        setWorkspaceNode(node);
        break;

     

           case 'addExcalidraw':
        setWorkspaceOpenPanel('excalidraw');
        setWorkspaceNode(node);
        break;

      case 'addMap':
        setWorkspaceOpenPanel('map');
        setWorkspaceNode(node);
        break;

      case 'togglePhotoOnNode':
        await updateNode(node.id, { metadata: { ...meta, photoOnNode: meta.photoOnNode === false } } as any);
        break;

      case 'removePhoto':
        await updateNode(node.id, { metadata: { ...meta, photo: null } } as any);
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
        
       default: {
        if (action.startsWith('setShape_')) {
          const shape = action.replace('setShape_', '');
          await updateNode(node.id, { metadata: { ...meta, shape } } as any);
                  } else if (action.startsWith('setColor_')) {
          const color = action.replace('setColor_', '');
          await updateNode(node.id, { metadata: { ...meta, color: color === 'reset' ? null : color } } as any);
        } else if (action.startsWith('setLineColor_')) {
          const lineColor = action.replace('setLineColor_', '');
          await updateNode(node.id, { metadata: { ...meta, lineColor: lineColor === 'reset' ? null : lineColor } } as any);
        } else if (action.startsWith('setPhoto_')) {
          const photo = action.replace('setPhoto_', '');
          await updateNode(node.id, { metadata: { ...meta, photo, photoOnNode: true } } as any);
        } else if (action.startsWith('setSize_')) {
                   const nodeSize = action.replace('setSize_', '');
          await updateNode(node.id, { metadata: { ...meta, nodeSize, nodeScale: null } } as any);
        } else if (action.startsWith('setScale_')) {
          const nodeScale = Number(action.replace('setScale_', ''));
          if (nodeScale > 0) await updateNode(node.id, { metadata: { ...meta, nodeScale } } as any);
        }
        break;
      }

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

 

  // ============================================================
  // RENDER: WORKSPACE MODE
  // ============================================================
  if (workspaceNode) {
    return (
      <NodeWorkspace
              node={workspaceNode}
              onClose={() => { setWorkspaceNode(null); setWorkspaceOpenPanel(undefined); setBacklinksRefresh(k => k + 1); fetchNodes(); }}
              onUpdateNode={updateNode}
        openPanel={workspaceOpenPanel}
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
            onOpenDocument={openDocument}
            onOpenFile={(file, page) => setPreviewFile({ file, page })}
          />
          {/* GRAPH VIEW */}
          {activeView === 'graph' && (
            <>
              {activeTab?.type === 'graph' && (
                <>
                  

                  {/* Graph */}
                  <div style={{ flex: 1, position: 'relative' }}
                  onContextMenu={(e) => {
                      e.preventDefault();
                      const target = e.target as Element;
                      const nodeGroup = target.closest('g[id^="node-group-"]');
                      console.log('React contextmenu:', target.tagName, nodeGroup?.id, nodes.length);
                      if (nodeGroup) {
                        const nodeId = parseInt(nodeGroup.id.replace('node-group-', ''));
                        const node = nodes.find(n => n.id === nodeId);
                        console.log('Found node:', nodeId, node?.name);
                        if (node) {
                          handleContextMenu(e, node);
                          return;
                        }
                      }
                      if (target.tagName === 'svg' || target.closest('svg')) {
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
                     <>
                     {/* 🔗 What each line colour means; click to hide/show (Auto = backlink lines from docs) */}
                     <LinkLegend
                        apiUrl={API_URL}
                        types={linkData.types}
                        links={linkData.links}
                        hidden={hiddenLinkTypes}
                        onToggle={toggleLinkType}
                        autoOn={showLinkLines}
                        onToggleAuto={() => setShowLinkLines(s => !s)}
                        canEdit={isOwner()}
                        onChanged={reloadLinks}
                      />
                     {/* 🧭 Graph tools answer (bottom-left) */}
                     {graphTool && (
                       <GraphToolsPanel
                          apiUrl={API_URL}
                          nodes={nodes}
                          types={linkData.types}
                          mode={graphTool.mode}
                          node={nodes.find(n => n.id === graphTool.node.id) || graphTool.node}
                          onClose={() => setGraphTool(null)}
                          onHighlight={setGraphHighlight}
                          onSelectNode={handleNodeClick}
                          onMarkDone={async goal => {
                            const meta = typeof goal.metadata === 'string' ? JSON.parse(goal.metadata) : goal.metadata || {};
                            await updateNode(goal.id, { metadata: { ...meta, todoStatus: 'done' } } as any);
                          }}
                        />
                     )}
                     <MindMapGraph
                        data={nodes}
                        onNodeClick={handleNodeClick}
                        onNodeDoubleClick={handleNodeDoubleClick}
                        onNodeContextMenu={handleContextMenu}
                        selectedNodeId={selectedNode?.id || null}
                        filterType={filterType}
                        linkEdges={showLinkLines ? linkEdges : undefined}
                                               customLinks={graphLinks}
                        onLinksChanged={reloadLinks}
                        highlight={graphTool ? graphHighlight : null}
                        tagColors={tagColors}
                      />
                     {/* 🏷 Show only one role / tag / type (top-left) */}
                     <select value={filterType} onChange={e => changeFilter(e.target.value)} title="Show only…"
                        style={{ position: 'absolute', top: 10, left: 10, zIndex: 5, background: filterType === 'all' ? 'rgba(30,30,46,0.95)' : '#1d4ed8',
                          color: '#fff', border: '1px solid #444', borderRadius: 6, padding: '5px 8px', fontSize: 12 }}>
                        <option value="all">🏷 All nodes</option>
                        <optgroup label="Role">
                          {ROLES.map(r => <option key={r.key} value={`role:${r.key}`}>{r.icon} {r.name}</option>)}
                        </optgroup>
                        {tags.length > 0 && (
                          <optgroup label="Tag">
                            {tags.map(t => <option key={t.id} value={`tag:${t.name}`}>● {t.name} ({t.nodes ?? 0})</option>)}
                          </optgroup>
                        )}
                        <optgroup label="Type">
                          {['person', 'medical', 'concept', 'location'].map(t => <option key={t} value={t}>{t}</option>)}
                        </optgroup>
                        {filterType.startsWith('tag:') && !tags.some(t => `tag:${t.name}` === filterType) && <option value={filterType}>{filterType.slice(4)}</option>}
                      </select>
                     </>
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

              {activeTab?.type === 'node' && activeTab.nodeId != null && (
                <div style={{ flex: 1, minHeight: 0 }}>
                  {/* A node opened as a tab shows its Docs (Etherpad was retired) */}
                  <DocumentsPanel key={activeTab.nodeId} nodeId={activeTab.nodeId} />
                </div>
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
              onUpdateEvent={async (id, updates) => {
                try {
                  await fetch(`${API_URL}/api/mindmap/events/${id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updates),
                  });
                } catch {}
                setCalendarEvents(prev => prev.map(e => e.id === id ? { ...e, ...updates } : e));
              }}
              onDeleteEvent={async (id) => {
                try { await fetch(`${API_URL}/api/mindmap/events/${id}`, { method: 'DELETE' }); } catch {}
                setCalendarEvents(prev => prev.filter(e => e.id !== id));
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
              tags={tags}
              focusNodeId={quizFocusNodeId}
              onClearFocus={() => setQuizFocusNodeId(null)}
            />
          )}
        

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
            {activeView === 'files' && (
              <FilesPanel nodes={nodes} />
            )}

          
              {/* A file opened from the search bar or Backlinks */}
              {previewFile && <FilePreview file={previewFile.file} page={previewFile.page} onClose={() => setPreviewFile(null)} />}

          {activeView === 'trash' && (
            <TrashView onRestored={fetchNodes} />
          )}
          </div>

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
                  {/* 🏷 Role and tags (click to change) */}
                  <div onClick={() => setLabelsNode(selectedNode)} title="Role & tags…"
                    style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: -8, marginBottom: 12, cursor: 'pointer', fontSize: 11 }}>
                    {roleOf(selectedNode) && <span style={{ background: '#333', color: '#ddd', borderRadius: 10, padding: '2px 8px' }}>{roleOf(selectedNode)!.icon} {roleOf(selectedNode)!.name}</span>}
                    {tagsOf(selectedNode).map(t => (
                      <span key={t} style={{ border: `1px solid ${tagColors[t] || '#888'}`, color: tagColors[t] || '#aaa', borderRadius: 10, padding: '1px 8px' }}>{t}</span>
                    ))}
                    {!roleOf(selectedNode) && !tagsOf(selectedNode).length && <span style={{ color: '#666' }}>🏷 Add role / tags</span>}
                    {roleOf(selectedNode)?.key === 'lessonPlan' && (
                      <span onClick={e => { e.stopPropagation(); setLessonPlanId(selectedNode.id); }} style={{ background: '#1d4ed8', color: '#fff', borderRadius: 10, padding: '2px 8px' }}>🗂 Open plan</span>
                    )}
                  </div>
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
                                      <button
                      onClick={() => { setQuizFocusNodeId(selectedNode.id); setActiveView('quiz'); }}
                      style={{
                        width: '100%', padding: '8px', marginBottom: '15px', background: '#6d28d9',
                        color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
                      }}
                    >
                      🧪 Study this node
                    </button>

                 {/* Backlinks — automatic links from docs, Draw notes, descriptions and map pins */}
                  <BacklinksPanel
                    node={selectedNode}
                    nodes={nodes}
                    refreshKey={backlinksRefresh}
                    onSelectNode={handleNodeClick}
                    onUpdateNode={updateNode}
                    onOpenFile={(file) => setPreviewFile({ file })}
                  />

                  {/* Photo — above the Quick Notes */}
                  <NodePhotoPanel node={selectedNode} onUpdateNode={updateNode} />

                  {/* Quick Notes — preview of the node's Draw (Excalidraw) notes; click to edit */}
                  <h4 style={{ margin: '0 0 10px 0' }}>Quick Notes</h4>
                  <NotesPreview
                    data={(typeof selectedNode.metadata === 'string'
                      ? JSON.parse(selectedNode.metadata)
                      : selectedNode.metadata || {}).excalidrawData}
                    onOpen={() => { setWorkspaceOpenPanel('excalidraw'); setWorkspaceNode(selectedNode); }}
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

      {/* 🏷 ROLE & TAGS */}
      {labelsNode && (
        <LabelsDialog
          apiUrl={API_URL}
          node={nodes.find(n => n.id === labelsNode.id) || labelsNode}
          tags={tags}
          onTagsChanged={reloadTags}
          onSave={patch => updateNode(labelsNode.id, { metadata: patch } as any)}
          onClose={() => setLabelsNode(null)}
        />
      )}

      {/* 🗂 LESSON PLAN */}
      {lessonPlanId != null && nodes.some(n => n.id === lessonPlanId) && (
        <LessonPlanPanel
          apiUrl={API_URL}
          plan={nodes.find(n => n.id === lessonPlanId)!}
          nodes={nodes}
          onClose={() => setLessonPlanId(null)}
          onChanged={fetchNodes}
          onUpdateNode={updateNode}
          onEditLesson={lesson => setLabelsNode(lesson)}
          onQuiz={id => { setLessonPlanId(null); setQuizFocusNodeId(id); setActiveView('quiz'); }}
          onShowNode={n => { setLessonPlanId(null); setSelectedNode(n); setActiveView('graph'); if (!rightPanelOpen) setRightPanelOpen(true); }}
        />
      )}

      {/* 🔗 ADD / EDIT A LINK */}
      {linkDialog && (
        <LinkDialog
          apiUrl={API_URL}
          nodes={nodes}
          types={linkData.types}
          source={linkDialog.source}
          link={linkDialog.link}
          onClose={() => setLinkDialog(null)}
          onSaved={reloadLinks}
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