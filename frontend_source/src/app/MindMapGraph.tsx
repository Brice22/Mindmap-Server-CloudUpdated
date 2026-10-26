// ============================================================
// MINDMAP GRAPH - D3.js Visualization Component
// ============================================================
// PURPOSE: Renders the visual mindmap using D3.js (Data-Driven Documents).
//
// D3.js is a library for creating interactive data visualizations.
// It manipulates SVG (Scalable Vector Graphics) elements based on data.
//
// KEY FEATURES:
// - Zoom and pan (scroll wheel + drag background)
// - Drag nodes to move them
// - Click to select
// - Double-click to open workspace
// - Real-time sync with WebSockets
//
// IMPORTANT FIXES INCLUDED:
// 1. Drag threshold (5px) - prevents accidental moves on click
// 2. Transform preservation - zoom/pan doesn't reset on click
// 3. Orphan detection - highlights nodes with missing parents
// 4. Position validation - catches invalid x/y values
// ============================================================

'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { io, Socket } from 'socket.io-client';
import type { Node, DragState, GraphLink } from '@/lib/types';

// ============================================================
// CONSTANTS
// ============================================================
const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'; // WebSocket server URL (adjust as needed)
// Live updates go straight to the backend (/socket.io/) when the address has a port, like
// http://192.168.4.194:3000; through nginx (/mindmap-socket/socket.io/) when it doesn't (https://… later)
const SOCKET_VIA_NGINX = !/:\d+$/.test(SOCKET_URL.replace(/\/+$/, ''));
const DRAG_THRESHOLD = 5;  // Pixels mouse must move to count as drag

// Saved photos are stored as /uploads/... — served by nginx on the server and
// passed to the backend by the rewrite in next.config.ts on the laptop
export function photoUrl(photo?: string | null) {
  return photo || '';
}

// Graph zoom/pan is remembered in this browser, so a refresh puts you back where you were
const TRANSFORM_KEY = 'hserver:graphTransform';
function loadTransform(): d3.ZoomTransform {
  try {
    const t = JSON.parse(localStorage.getItem(TRANSFORM_KEY) || 'null');
    if (t && [t.x, t.y, t.k].every((n: any) => Number.isFinite(n))) return d3.zoomIdentity.translate(t.x, t.y).scale(t.k);
  } catch {}
  return d3.zoomIdentity;
}

// ------------------------------------------------------------
// NODE SHAPES — every shape is drawn around (0,0) with "radius" r
// ------------------------------------------------------------
export const NODE_SHAPES = ['circle', 'ellipse', 'square', 'rectangle', 'pill', 'diamond', 'triangle', 'pentagon', 'hexagon', 'octagon', 'star'] as const;

  // Node radius: the % slider (nodeScale, 100% = medium) wins over small/medium/large
  const SIZE_PRESETS: Record<string, number> = { small: 18, medium: 25, large: 35 };
  export function nodeRadius(meta: any): number {
    const scale = Number(meta?.nodeScale);
    if (Number.isFinite(scale) && scale > 0) return 25 * Math.min(4, Math.max(0.3, scale / 100));
    return SIZE_PRESETS[meta?.nodeSize || 'medium'] || 25;
  }

function polygonPoints(sides: number, r: number, rotate = -Math.PI / 2) {
  return Array.from({ length: sides }, (_, i) => {
    const a = rotate + (2 * Math.PI * i) / sides;
    return `${r * Math.cos(a)},${r * Math.sin(a)}`;
  }).join(' ');
}

function starPoints(r: number) {
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (Math.PI * i) / 5;
    const rr = i % 2 === 0 ? r * 1.35 : r * 0.6;
    return `${rr * Math.cos(a)},${rr * Math.sin(a)}`;
  }).join(' ');
}

// Appends the shape to `g` (a node group or a clipPath) and returns it
function appendShape(g: any, shape: string, r: number) {
  switch (shape) {
    case 'ellipse': return g.append('ellipse').attr('rx', r * 1.5).attr('ry', r);
    case 'square': return g.append('rect').attr('x', -r).attr('y', -r).attr('width', r * 2).attr('height', r * 2).attr('rx', 3);
    case 'rectangle': return g.append('rect').attr('x', -r * 1.4).attr('y', -r).attr('width', r * 2.8).attr('height', r * 2).attr('rx', 4);
    case 'pill': return g.append('rect').attr('x', -r * 1.6).attr('y', -r * 0.8).attr('width', r * 3.2).attr('height', r * 1.6).attr('rx', r * 0.8);
    case 'diamond': return g.append('polygon').attr('points', `0,${-r * 1.3} ${r * 1.3},0 0,${r * 1.3} ${-r * 1.3},0`);
    case 'triangle': return g.append('polygon').attr('points', polygonPoints(3, r * 1.4)).attr('transform', `translate(0,${r * 0.2})`);
    case 'pentagon': return g.append('polygon').attr('points', polygonPoints(5, r * 1.2));
    case 'hexagon': return g.append('polygon').attr('points', polygonPoints(6, r * 1.2));
    case 'octagon': return g.append('polygon').attr('points', polygonPoints(8, r * 1.15, -Math.PI / 8));
    case 'star': return g.append('polygon').attr('points', starPoints(r));
    default: return g.append('circle').attr('r', r);
  }
}

// Node colors by type
const TYPE_COLORS: Record<string, string> = {
  person: '#3b82f6',    // Blue
  medical: '#ef4444',   // Red
  concept: '#22c55e',   // Green
  location: '#f59e0b',  // Amber
  default: '#6b7280',   // Gray
};

// ============================================================
// PROPS INTERFACE
// ============================================================
interface MindMapGraphProps {
  data: Node[];
  onNodeClick: (node: Node) => void;
  onNodeDoubleClick: (node: Node) => void;
  onNodeContextMenu: (e: React.MouseEvent, node: Node) => void;
  selectedNodeId: number | null;
  filterType: string;
  linkEdges?: { source: number; target: number; kind: 'link' | 'mention' }[];  // backlink lines (dashed)
  customLinks?: GraphLink[];          // 🔗 your own links (colour/dash/arrow from their link type)
  onLinksChanged?: () => void;        // another browser changed links → reload them
}

// One line on the graph: to a parent, a backlink (auto), or one of your links
type GraphEdge = {
  source: number; target: number; label?: string; color?: string;
  kind?: 'link' | 'mention' | 'custom';
  id?: number; dashed?: boolean; arrow?: boolean; typeName?: string;
  offset?: number;                     // side-step when two nodes have more than one line
};

// Same empty array every render, so "no link lines" doesn't redraw the graph each time
const NO_LINK_EDGES: { source: number; target: number; kind: 'link' | 'mention' }[] = [];
const NO_CUSTOM_LINKS: GraphLink[] = [];

// ============================================================
// COMPONENT
// ============================================================
export default function MindMapGraph({
  data,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
    selectedNodeId,
  filterType,
  linkEdges = NO_LINK_EDGES,
  customLinks = NO_CUSTOM_LINKS,
  onLinksChanged,
}: MindMapGraphProps) {
  // --------------------------------------------------------
  // REFS
  // --------------------------------------------------------
  // Refs persist across re-renders without causing re-renders
  // --------------------------------------------------------
  const svgRef = useRef<SVGSVGElement>(null);        // The SVG element
  const socketRef = useRef<Socket | null>(null);     // WebSocket connection
  const transformRef = useRef<d3.ZoomTransform>(typeof window !== 'undefined' ? loadTransform() : d3.zoomIdentity); // Current zoom state (restored after refresh)
  const saveTransformTimer = useRef<any>(null);
  const nodePositionsRef = useRef<Record<number, { x: number; y: number }>>({});
  const dragStateRef = useRef<DragState>({           // Drag tracking
    isDragging: false,
    startX: 0,
    startY: 0,
    nodeId: null,
    hasMoved: false,
    });

  // Store callbacks in ref to avoid dependency issues
  const callbacksRef = useRef({ onNodeClick, onNodeDoubleClick, onNodeContextMenu, onLinksChanged });
  useEffect(() => {
    callbacksRef.current = { onNodeClick, onNodeDoubleClick, onNodeContextMenu, onLinksChanged };
  }, [onNodeClick, onNodeDoubleClick, onNodeContextMenu, onLinksChanged]);
  // Moves a node and its lines (set by the drawing code; used for moves from other browsers)
  const moveNodeRef = useRef<((id: number, x: number, y: number) => void) | null>(null);

  // ============================================================
  // WEBSOCKET CONNECTION
  // ============================================================
 
 // Document-level contextmenu for nodes — bypasses all D3/React conflicts
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (!target.closest('svg')) return;
      const nodeGroup = target.closest('g[id^="node-group-"]');
      if (!nodeGroup) return;
      e.preventDefault();
      const nodeId = parseInt(nodeGroup.id.replace('node-group-', ''));
      const node = dataRef.current.find(n => n.id === nodeId);
      if (node) callbacksRef.current.onNodeContextMenu(e as any, node);
    };
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, []);
  // Connects once when component mounts, disconnects on unmount.
  // ============================================================
  useEffect(() => {
    console.log('[MindMapGraph] Connecting to WebSocket...');
    
    // Connect to the mindmap namespace
    socketRef.current = io(`${SOCKET_URL}/mindmap`, {
      path: SOCKET_VIA_NGINX ? '/mindmap-socket/socket.io/' : '/socket.io/',
      transports: ['websocket'],
      secure: SOCKET_URL.startsWith('https'),
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current.on('connect', () => {
      console.log('[MindMapGraph] WebSocket connected:', socketRef.current?.id);
    });

    socketRef.current.on('disconnect', () => {
          console.log('[MindMapGraph] WebSocket disconnected');
    });

    socketRef.current.on('connect_error', (err: any) => {
      console.warn('[MindMapGraph] Live updates not connected:', err?.message);
    });

    // Someone added, changed or removed a link in another browser
    socketRef.current.on('links_changed', () => {
      callbacksRef.current.onLinksChanged?.();
    });

    // --------------------------------------------------------
    // LISTEN: node_moved
    // --------------------------------------------------------
    // When another user drags a node, move it on our screen too
    // --------------------------------------------------------
    socketRef.current.on('node_moved', (moveData: { id: number; x: number; y: number }) => {
      // Move the node and its lines
      if (moveNodeRef.current) moveNodeRef.current(Number(moveData.id), moveData.x, moveData.y);
      else d3.select(`#node-group-${moveData.id}`).attr('transform', `translate(${moveData.x}, ${moveData.y})`);
    });

    // Cleanup on unmount
    return () => {
      console.log('[MindMapGraph] Disconnecting WebSocket...');
      socketRef.current?.disconnect();
    };
  }, []);

  // ============================================================
  // HELPER: Validate Position
  // ============================================================
  // Ensures x/y are valid numbers. Assigns random position if not.
  // ============================================================
  const validatePosition = useCallback((node: Node): { x: number; y: number } => {
    let x = node.x;
    let y = node.y;
    
    // Check for invalid values
    if (typeof x !== 'number' || isNaN(x) || x === 0) {
      x = 200 + Math.random() * 400;  // Random x between 200-600
    }
    if (typeof y !== 'number' || isNaN(y) || y === 0) {
      y = 200 + Math.random() * 400;  // Random y between 200-600
    }
    
    return { x, y };
  }, []);

  // ============================================================
  // HELPER: Check for Orphaned Parent
  // ============================================================
  // Returns true if node claims a parent that doesn't exist.
  // ============================================================
  const hasOrphanedParent = useCallback((node: Node, allNodes: Node[]): boolean => {
    const meta = typeof node.metadata === 'string' 
      ? JSON.parse(node.metadata) 
      : node.metadata || {};
    
    const parentName = meta.parent;
    if (!parentName) return false;
    
    // Check if any node has this name
    const parentExists = allNodes.some(
      n => n.name.toLowerCase() === parentName.toLowerCase()
    );
    
    return !parentExists;
  }, []);

  // ============================================================
  // MAIN D3 RENDERING
  // ============================================================
  // This effect runs whenever data, selectedNodeId, or filterType changes.
  // It rebuilds the entire SVG visualization.
  // ============================================================
  useEffect(() => {
    if (!svgRef.current || !data.length) return;

    console.log('[MindMapGraph] Rendering', data.length, 'nodes');

    const svg = d3.select(svgRef.current);
    const width = svgRef.current.clientWidth || 800;
    const height = svgRef.current.clientHeight || 600;

    // Clear previous content
    svg.selectAll('*').remove();

    // --------------------------------------------------------
    // FILTER NODES BY TYPE
    // --------------------------------------------------------
    let filteredData = data;
    if (filterType !== 'all') {
      filteredData = data.filter(node => {
        const meta = typeof node.metadata === 'string'
          ? JSON.parse(node.metadata)
          : node.metadata || {};
        return meta.type === filterType;
      });
    }

    // --------------------------------------------------------
    // PREPARE D3 DATA
    // --------------------------------------------------------
   const d3Nodes = filteredData.map(node => {
      const stored = nodePositionsRef.current[node.id];
      const pos = stored || validatePosition(node);
      if (!stored) nodePositionsRef.current[node.id] = pos;
      return {
        ...node,
        x: pos.x,
        y: pos.y,
        fx: pos.x,
        fy: pos.y,
      };
    });

    // Build edges from parent references
    const edges: GraphEdge[] = [];
    filteredData.forEach(node => {
      const meta = typeof node.metadata === 'string'
        ? JSON.parse(node.metadata)
        : node.metadata || {};
      
      if (meta.parent) {
        const parent = filteredData.find(
          n => n.name.toLowerCase() === meta.parent.toLowerCase()
        );
        if (parent) {
          edges.push({
            source: node.id,
            target: parent.id,
            label: meta.linkText || '',
             color: meta.lineColor || undefined,   // colour of the line to its parent
          });
        }
           }
    });

    // 🔗 Your links between visible nodes
    const visibleIds = new Set(filteredData.map(n => n.id));
    for (const l of customLinks) {
      if (!visibleIds.has(l.source) || !visibleIds.has(l.target)) continue;
      edges.push({ source: l.source, target: l.target, label: l.label, kind: 'custom', id: l.id,
        color: l.color, dashed: l.dashed, arrow: l.arrow, typeName: l.typeName });
    }

       // Backlink lines (dashed) between visible nodes, skipping pairs already joined by a line
    const joined = new Set(edges.map(e => [e.source, e.target].sort().join('-')));
    for (const l of linkEdges) {
      const key = [l.source, l.target].sort().join('-');
      if (!visibleIds.has(l.source) || !visibleIds.has(l.target) || joined.has(key)) continue;
      joined.add(key);
           edges.push({ source: l.source, target: l.target, label: '', kind: l.kind });
    }

    // Two nodes with several lines: each extra line steps to the side (0, +9, -9, +18…)
    const perPair: Record<string, number> = {};
    for (const e of edges) {
      const key = [e.source, e.target].sort((a, b) => a - b).join('-');
      const i = perPair[key] = (perPair[key] ?? -1) + 1;
      const step = Math.ceil(i / 2) * 9 * (i % 2 ? 1 : -1);
      // same side no matter which way the line points
      e.offset = e.source < e.target ? step : -step;
    }

    // Where a line starts and ends: side-step for extra lines, arrow tip stops at the node's edge
    const nodeById = new Map(d3Nodes.map(n => [n.id, n]));
    const metaOf = (n: any) => (typeof n?.metadata === 'string' ? JSON.parse(n.metadata) : n?.metadata || {});
    const ends = (e: GraphEdge) => {
      const s = nodeById.get(e.source), t = nodeById.get(e.target);
      if (!s || !t) return { x1: 0, y1: 0, x2: 0, y2: 0 };
      let x1 = s.x, y1 = s.y, x2 = t.x, y2 = t.y;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const off = e.offset || 0;
      x1 += (-dy / len) * off; y1 += (dx / len) * off;
      x2 += (-dy / len) * off; y2 += (dx / len) * off;
      if (e.arrow) {
        const back = Math.min(len / 2, nodeRadius(metaOf(t)) + 6);
        x2 -= (dx / len) * back; y2 -= (dy / len) * back;
      }
      return { x1, y1, x2, y2 };
    };

    // --------------------------------------------------------
    // CREATE CONTAINER GROUP
    // --------------------------------------------------------
    // All visual elements go inside this group.
    // When we zoom, we transform this group (not individual elements).
    // --------------------------------------------------------
    const container = svg.append('g')
      .attr('transform', transformRef.current.toString());

    // --------------------------------------------------------
    // SETUP ZOOM BEHAVIOR
    // --------------------------------------------------------
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])  // Zoom limits: 10% to 400%
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        container.attr('transform', event.transform.toString());
                // Remember zoom/pan (saved half a second after you stop moving)
        clearTimeout(saveTransformTimer.current);
        saveTransformTimer.current = setTimeout(() => {
          try {
            const t = event.transform;
            localStorage.setItem(TRANSFORM_KEY, JSON.stringify({ x: t.x, y: t.y, k: t.k }));
          } catch {}
        }, 500);
      });

    svg.call(zoom);

        // Restore previous transform (preserves zoom/pan state)
    svg.call(zoom.transform, transformRef.current);

    // Arrow heads, one per colour used by your link types
    const arrowId = (color: string) => `hs-arrow-${color.replace(/[^0-9a-zA-Z]/g, '')}`;
    const defs = svg.append('defs');
    for (const color of Array.from(new Set(edges.filter(e => e.arrow && e.color).map(e => e.color!)))) {
      defs.append('marker')
        .attr('id', arrowId(color))
        .attr('viewBox', '0 -5 10 10')
        .attr('refX', 9).attr('refY', 0)
        .attr('markerUnits', 'userSpaceOnUse')
        .attr('markerWidth', 11).attr('markerHeight', 11)
        .attr('orient', 'auto')
        .append('path').attr('d', 'M0,-5L10,0L0,5Z').attr('fill', color);
    }
    // --------------------------------------------------------
    // DRAW EDGES (Lines between nodes)
    // --------------------------------------------------------
    const edgeGroups = container.append('g')
      .attr('class', 'edges')
      .selectAll('g')
      .data(edges)
      .enter()
      .append('g');

       // Draw the line
    edgeGroups.append('line')
      .attr('class', 'edge-line')
      .attr('x1', d => ends(d).x1).attr('y1', d => ends(d).y1)
      .attr('x2', d => ends(d).x2).attr('y2', d => ends(d).y2)
      .attr('stroke', d => (d.kind === 'link' ? '#3b82f6' : d.kind === 'mention' ? '#888' : d.color || (d.kind === 'custom' ? '#9ca3af' : '#555')))
      .attr('stroke-width', d => (d.kind === 'custom' ? 2.5 : d.kind ? 1.5 : 2))
      .attr('stroke-dasharray', d => (d.kind === 'custom' ? (d.dashed ? '8,5' : null) : d.kind ? '5,4' : null))
      .attr('stroke-opacity', d => (d.kind === 'custom' ? 0.95 : d.color ? 0.9 : 0.6))
      .attr('marker-end', d => (d.arrow && d.color ? `url(#${arrowId(d.color)})` : null));

    // Wider invisible line on top, so thin lines are easy to right-click
    edgeGroups.append('line')
      .attr('class', 'edge-hit')
      .attr('x1', d => ends(d).x1).attr('y1', d => ends(d).y1)
      .attr('x2', d => ends(d).x2).attr('y2', d => ends(d).y2)
      .attr('stroke', 'transparent').attr('stroke-width', 12)
      .style('cursor', d => (d.kind === 'custom' || !d.kind ? 'context-menu' : 'default'));

    // Hover text: what kind of line it is
    edgeGroups.append('title').text(d =>
      d.kind === 'custom' ? `${d.typeName || 'No type'}${d.label ? `: ${d.label}` : ''} (right-click to edit)`
      : d.kind === 'link' ? 'Linked in a document' : d.kind === 'mention' ? 'Mentioned in text' : d.label ? `Parent line: ${d.label}` : 'Parent line');

  // Right-click edge to edit relationship
    edgeGroups.on('contextmenu', function(event: any, d: any) {
      event.preventDefault();
      event.stopPropagation();
      if (d.kind === 'custom') {   // 🔗 your link → edit it
        window.dispatchEvent(new CustomEvent('editCustomLink', { detail: { linkId: d.id } }));
        return;
      }
      if (d.kind) return; // backlink lines have no relationship text to edit
      const sourceNode = filteredData.find(n => n.id === d.source);
      if (sourceNode) {
        callbacksRef.current.onNodeClick(sourceNode);
        // Trigger editLinkText via a custom event
        window.dispatchEvent(new CustomEvent('editLinkText', { detail: sourceNode }));
          }
    });

    // Draw edge labels (halfway along the line)
    const midX = (d: GraphEdge) => { const p = ends(d); return (p.x1 + p.x2) / 2; };
    const midY = (d: GraphEdge) => { const p = ends(d); return (p.y1 + p.y2) / 2 - 3; };
    edgeGroups.append('text')
      .attr('class', 'edge-label')
      .attr('x', midX)
      .attr('y', midY)
      .style('pointer-events', 'none')
      .attr('fill', d => (d.kind === 'custom' && d.color ? d.color : '#888'))
      .attr('font-size', 10)
      .attr('text-anchor', 'middle')
      .text(d => d.label || '');

    // --------------------------------------------------------
    // DRAW NODES
    // --------------------------------------------------------
    const nodeGroups = container.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(d3Nodes)
      .enter()
      .append('g')
      .attr('id', d => `node-group-${d.id}`)
      .attr('transform', d => `translate(${d.x}, ${d.y})`)
      .attr('cursor', 'pointer');

    // --------------------------------------------------------
   // Invisible hit area for click/right-click on all node shapes
    nodeGroups.append('circle')
      .attr('r', (d: any) => {
        const meta = typeof d.metadata === 'string' ? JSON.parse(d.metadata) : d.metadata || {};
           return nodeRadius(meta) * 1.4;
      })
      .attr('fill', 'transparent')
      .style('pointer-events', 'all');
    // --------------------------------------------------------
    // NODE SHAPE
    // --------------------------------------------------------

    nodeGroups.each(function(d: any) {
      const meta = typeof d.metadata === 'string' ? JSON.parse(d.metadata) : d.metadata || {};
      const shape = meta.shape || 'circle';
      const r = nodeRadius(meta);
      const fill = meta.color || TYPE_COLORS[meta.type] || TYPE_COLORS.default;   // custom colour wins      
      const isSelected = d.id === selectedNodeId;
      const stroke = isSelected ? '#fff' : 'transparent';
      const strokeWidth = isSelected ? 3 : 0;
      const filter = isSelected ? 'drop-shadow(0 0 10px white)' : 'none';
      const g = d3.select(this);

          appendShape(g, shape, r)
        .attr('fill', fill).attr('stroke', stroke)
        .attr('stroke-width', strokeWidth).attr('filter', filter);

      // Photo inside the node (cropped to its shape)
      if (meta.photo && meta.photoOnNode !== false) {
        const clipId = `clip-photo-${d.id}`;
        appendShape(g.append('clipPath').attr('id', clipId), shape, r);
        g.append('image')
          .attr('href', photoUrl(meta.photo))
          .attr('x', -r * 1.6).attr('y', -r * 1.4)
          .attr('width', r * 3.2).attr('height', r * 2.8)
          .attr('preserveAspectRatio', 'xMidYMid slice')
          .attr('clip-path', `url(#${clipId})`)
          .style('pointer-events', 'none');
      }

      // Formula/text/table preview on node
      if (meta.formula|| meta.tableData) {
        const previewText = meta.formula
          ? meta.formula
          : meta.tableData
          ? `📋 ${meta.tableData.headers.slice(0, 3).join(' | ')}`
          : (meta.description || '').slice(0, 40);
        if (previewText) {
                   const previewDiv = g.append('foreignObject')
            .attr('x', -r * 0.8).attr('y', -r * 0.5)
            .attr('width', r * 1.6).attr('height', r)
            .append('xhtml:div')
            .style('font-size', `${Math.max(7, r * 0.35)}px`)
            .style('color', '#fff')
            .style('text-align', 'center')
            .style('overflow', 'hidden')
            .style('line-height', '1.2')
            .style('opacity', '0.7')
            .style('pointer-events', 'none');
          // Formulas render as real math (KaTeX); everything else as plain text
          if (meta.formula) {
            previewDiv.html(katex.renderToString(meta.formula, { throwOnError: false, displayMode: false }));
          } else {
            previewDiv.text(previewText);
          }
        }
      }
       
      
    });
    // --------------------------------------------------------
    // ORPHAN WARNING RING
    // --------------------------------------------------------
    // Orange dashed ring if node has a parent that doesn't exist
    // --------------------------------------------------------
    nodeGroups.each(function(d: any) {
      if (hasOrphanedParent(d, data)) {
        const meta = typeof d.metadata === 'string' ? JSON.parse(d.metadata) : d.metadata || {};
        const r = nodeRadius(meta) + 5;
        d3.select(this)
          .append('circle')
          .attr('r', r)
          .attr('fill', 'none')
          .attr('stroke', '#f97316')
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,3');
      }
    });



    // --------------------------------------------------------
    // NODE LABEL
    // --------------------------------------------------------
   nodeGroups.append('text')
      .attr('y', (d: any) => {
        const meta = typeof d.metadata === 'string' ? JSON.parse(d.metadata) : d.metadata || {};
        return nodeRadius(meta) + 15;
      })
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', 12)
      .attr('font-weight', 500)
      .text(d => d.name.length > 15 ? d.name.slice(0, 12) + '...' : d.name);

    // Redraw the lines touching one node (after a drag or a move from another browser)
    const updateEdges = (nodeId: number) => {
      const touches = (edge: any) => edge.source === nodeId || edge.target === nodeId;
      container.selectAll<SVGLineElement, GraphEdge>('.edges line').filter(touches)
        .attr('x1', e => ends(e).x1).attr('y1', e => ends(e).y1)
        .attr('x2', e => ends(e).x2).attr('y2', e => ends(e).y2);
      container.selectAll<SVGTextElement, GraphEdge>('.edges text').filter(touches)
        .attr('x', midX).attr('y', midY);
    };
    moveNodeRef.current = (id, x, y) => {
      const n = nodeById.get(id);
      if (!n || !Number.isFinite(x) || !Number.isFinite(y)) return;
      n.x = x; n.y = y;
      nodePositionsRef.current[id] = { x, y };
      container.select(`#node-group-${id}`).attr('transform', `translate(${x}, ${y})`);
      updateEdges(id);
    };

    // --------------------------------------------------------
    // DRAG BEHAVIOR
    // --------------------------------------------------------
    // Implements the drag threshold fix
    // --------------------------------------------------------
    const drag = d3.drag<SVGGElement, typeof d3Nodes[0]>()
      .filter((event: any) => event.button === 0)
      .on('start', function(event, d) {
        // Record starting position
        dragStateRef.current = {
          isDragging: true,
          startX: event.x,
          startY: event.y,
          nodeId: d.id,
          hasMoved: false,
        };
      })
      .on('drag', function(event, d) {
        // Calculate distance moved
        const dx = event.x - dragStateRef.current.startX;
        const dy = event.y - dragStateRef.current.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Only start moving if beyond threshold
        if (distance > DRAG_THRESHOLD) {
          dragStateRef.current.hasMoved = true;
          
          // Update visual position
          d.x = event.x;
          d.y = event.y;
          nodePositionsRef.current[d.id] = { x: d.x, y: d.y };

          d3.select(this).attr('transform', `translate(${d.x}, ${d.y})`);

          // Broadcast to other users (real-time)
          socketRef.current?.emit('node_move', {
            id: d.id,
            x: d.x,
            y: d.y,
          });

          // Update connected edges (and their labels)
          updateEdges(d.id);
        }
      })
      .on('end', function(event, d) {
        // Only save if we actually moved
        if (dragStateRef.current.hasMoved) {
          console.log(`[MindMapGraph] Saving position: Node ${d.id} at (${d.x}, ${d.y})`);
          
          // Save to database via WebSocket
          socketRef.current?.emit('node_drag_end', {
            id: d.id,
            x: Math.round(d.x),
            y: Math.round(d.y),
          });
        }

        // Reset drag state
        dragStateRef.current = {
          isDragging: false,
          startX: 0,
          startY: 0,
          nodeId: null,
          hasMoved: false,
        };
      });

    nodeGroups.call(drag);

    // --------------------------------------------------------
    // CLICK HANDLER
    // --------------------------------------------------------
    // Only fires if we didn't drag
    // --------------------------------------------------------
    nodeGroups.on('click', function(event, d) {
      event.stopPropagation();
      
      // If we moved, don't count as click
      if (dragStateRef.current.hasMoved) return;
      
      console.log('[MindMapGraph] Node clicked:', d.name);

     // Toggle highlighting of this node's parent and children
      const isHighlighted = d3.select(this).classed('highlighted');
      container.selectAll('g[id^="node-group-"]').classed('highlighted', false).style('opacity', 1);

      if (!isHighlighted) {
        d3.select(this).classed('highlighted', true);
        
        // Highlight adjacent nodes (parent + children), dim the rest
        const meta = typeof d.metadata === 'string' ? JSON.parse(d.metadata) : d.metadata || {};
        const parentName = meta.parent?.toLowerCase();
        
        // …and anything joined to it by one of your links
        const linked = new Set(edges.filter(e => e.kind === 'custom' && (e.source === d.id || e.target === d.id))
          .map(e => (e.source === d.id ? e.target : e.source)));
        container.selectAll('g[id^="node-group-"]').style('opacity', (n: any) => {
          const nMeta = typeof n.metadata === 'string' ? JSON.parse(n.metadata) : n.metadata || {};
          if (n.id === d.id || linked.has(n.id)) return 1;
          if (parentName && n.name.toLowerCase() === parentName) return 1;
          if (nMeta.parent?.toLowerCase() === d.name.toLowerCase()) return 1;
          return 0.25;
        });
      }
      
      callbacksRef.current.onNodeClick(d);
    });

    // --------------------------------------------------------
    // DOUBLE-CLICK HANDLER
    // --------------------------------------------------------
    nodeGroups.on('dblclick', function(event, d) {
      event.stopPropagation();
      console.log('[MindMapGraph] Node double-clicked:', d.name);
      callbacksRef.current.onNodeDoubleClick(d);
    });


    // --------------------------------------------------------
    // BACKGROUND CLICK - Deselect
    // --------------------------------------------------------
    svg.on('click', () => {
      callbacksRef.current.onNodeClick(null as any);
    });

    

  }, [data, selectedNodeId, filterType, validatePosition, hasOrphanedParent, linkEdges, customLinks]);

  // ============================================================
  // RENDER
  // ============================================================
 
  return (
    <svg
      ref={svgRef}
      style={{
        width: '100%',
        height: '100%',
        background: '#1a1a2e',
      }}
    />
  );
}
