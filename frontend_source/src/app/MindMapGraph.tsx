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
import { io, Socket } from 'socket.io-client';
import type { Node, DragState } from '@/lib/types';

// ============================================================
// CONSTANTS
// ============================================================
const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || '';
const DRAG_THRESHOLD = 5;  // Pixels mouse must move to count as drag

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
  data: Node[];                           // Array of nodes to display
  onNodeClick: (node: Node) => void;      // Called when node is clicked
  onNodeDoubleClick: (node: Node) => void; // Called when node is double-clicked
  selectedNodeId: number | null;          // Currently selected node
  filterType: string;                     // Filter nodes by type ('all' or specific)
}

// ============================================================
// COMPONENT
// ============================================================
export default function MindMapGraph({
  data,
  onNodeClick,
  onNodeDoubleClick,
  selectedNodeId,
  filterType,
}: MindMapGraphProps) {
  // --------------------------------------------------------
  // REFS
  // --------------------------------------------------------
  // Refs persist across re-renders without causing re-renders
  // --------------------------------------------------------
  const svgRef = useRef<SVGSVGElement>(null);        // The SVG element
  const socketRef = useRef<Socket | null>(null);     // WebSocket connection
  const transformRef = useRef<d3.ZoomTransform>(d3.zoomIdentity); // Current zoom state
  const dragStateRef = useRef<DragState>({           // Drag tracking
    isDragging: false,
    startX: 0,
    startY: 0,
    nodeId: null,
    hasMoved: false,
  });

  // Store callbacks in ref to avoid dependency issues
  const callbacksRef = useRef({ onNodeClick, onNodeDoubleClick });
  useEffect(() => {
    callbacksRef.current = { onNodeClick, onNodeDoubleClick };
  }, [onNodeClick, onNodeDoubleClick]);

  // ============================================================
  // WEBSOCKET CONNECTION
  // ============================================================
  // Connects once when component mounts, disconnects on unmount.
  // ============================================================
  useEffect(() => {
    console.log('[MindMapGraph] Connecting to WebSocket...');
    
    // Connect to the mindmap namespace
    socketRef.current = io(`${SOCKET_URL}/mindmap`, {
      path: '/mindmap-socket/socket.io/',
      transports: ['websocket'],
      secure: true,
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

    // --------------------------------------------------------
    // LISTEN: node_moved
    // --------------------------------------------------------
    // When another user drags a node, move it on our screen too
    // --------------------------------------------------------
    socketRef.current.on('node_moved', (moveData: { id: number; x: number; y: number }) => {
      // Find the node group and update its position
      d3.select(`#node-group-${moveData.id}`)
        .attr('transform', `translate(${moveData.x}, ${moveData.y})`);
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
      const pos = validatePosition(node);
      return {
        ...node,
        x: pos.x,
        y: pos.y,
        fx: pos.x,  // Fixed position (no physics)
        fy: pos.y,
      };
    });

    // Build edges from parent references
    const edges: { source: number; target: number; label?: string }[] = [];
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
          });
        }
      }
    });

    // --------------------------------------------------------
    // SETUP ZOOM BEHAVIOR
    // --------------------------------------------------------
    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])  // Zoom limits: 10% to 400%
      .on('zoom', (event) => {
        transformRef.current = event.transform;
        container.attr('transform', event.transform.toString());
      });

    svg.call(zoom);

    // Restore previous transform (preserves zoom/pan state)
    svg.call(zoom.transform, transformRef.current);

    // --------------------------------------------------------
    // CREATE CONTAINER GROUP
    // --------------------------------------------------------
    // All visual elements go inside this group.
    // When we zoom, we transform this group (not individual elements).
    // --------------------------------------------------------
    const container = svg.append('g')
      .attr('transform', transformRef.current.toString());

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
      .attr('x1', d => {
        const source = d3Nodes.find(n => n.id === d.source);
        return source?.x || 0;
      })
      .attr('y1', d => {
        const source = d3Nodes.find(n => n.id === d.source);
        return source?.y || 0;
      })
      .attr('x2', d => {
        const target = d3Nodes.find(n => n.id === d.target);
        return target?.x || 0;
      })
      .attr('y2', d => {
        const target = d3Nodes.find(n => n.id === d.target);
        return target?.y || 0;
      })
      .attr('stroke', '#555')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6);

    // Draw edge labels
    edgeGroups.append('text')
      .attr('x', d => {
        const source = d3Nodes.find(n => n.id === d.source);
        const target = d3Nodes.find(n => n.id === d.target);
        return ((source?.x || 0) + (target?.x || 0)) / 2;
      })
      .attr('y', d => {
        const source = d3Nodes.find(n => n.id === d.source);
        const target = d3Nodes.find(n => n.id === d.target);
        return ((source?.y || 0) + (target?.y || 0)) / 2;
      })
      .attr('fill', '#888')
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
    // NODE CIRCLE
    // --------------------------------------------------------
    nodeGroups.append('circle')
      .attr('r', 25)
      .attr('fill', d => {
        const meta = typeof d.metadata === 'string'
          ? JSON.parse(d.metadata)
          : d.metadata || {};
        return TYPE_COLORS[meta.type] || TYPE_COLORS.default;
      })
      .attr('stroke', d => d.id === selectedNodeId ? '#fff' : 'transparent')
      .attr('stroke-width', d => d.id === selectedNodeId ? 3 : 0)
      .attr('filter', d => d.id === selectedNodeId ? 'drop-shadow(0 0 10px white)' : 'none');

    // --------------------------------------------------------
    // ORPHAN WARNING RING
    // --------------------------------------------------------
    // Orange dashed ring if node has a parent that doesn't exist
    // --------------------------------------------------------
    nodeGroups.each(function(d) {
      if (hasOrphanedParent(d, data)) {
        d3.select(this)
          .append('circle')
          .attr('r', 30)
          .attr('fill', 'none')
          .attr('stroke', '#f97316')  // Orange
          .attr('stroke-width', 2)
          .attr('stroke-dasharray', '5,3');
      }
    });

    // --------------------------------------------------------
    // NODE PHOTO (hidden by default, toggled on click)
    // --------------------------------------------------------
    nodeGroups.append('clipPath')
      .attr('id', d => `clip-photo-${d.id}`)
      .append('circle')
      .attr('r', 20);

    nodeGroups.append('image')
      .attr('x', -20)
      .attr('y', -20)
      .attr('width', 40)
      .attr('height', 40)
      .attr('clip-path', d => `url(#clip-photo-${d.id})`)
      .attr('href', (d: any) => {
        const m = typeof d.metadata === 'string' ? JSON.parse(d.metadata) : d.metadata || {};
        return m.photo || '';
      })
      .style('display', 'none')
      .attr('class', 'node-photo');

    // --------------------------------------------------------
    // NODE LABEL
    // --------------------------------------------------------
    nodeGroups.append('text')
      .attr('y', 40)
      .attr('text-anchor', 'middle')
      .attr('fill', '#fff')
      .attr('font-size', 12)
      .attr('font-weight', 500)
      .text(d => d.name.length > 15 ? d.name.slice(0, 12) + '...' : d.name);

    // --------------------------------------------------------
    // DRAG BEHAVIOR
    // --------------------------------------------------------
    // Implements the drag threshold fix
    // --------------------------------------------------------
    const drag = d3.drag<SVGGElement, typeof d3Nodes[0]>()
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
          d3.select(this).attr('transform', `translate(${d.x}, ${d.y})`);

          // Broadcast to other users (real-time)
          socketRef.current?.emit('node_move', {
            id: d.id,
            x: d.x,
            y: d.y,
          });

          // Update connected edges
          container.selectAll('line')
            .filter((edge: any) => edge.source === d.id || edge.target === d.id)
            .attr('x1', (edge: any) => {
              const source = d3Nodes.find(n => n.id === edge.source);
              return source?.x || 0;
            })
            .attr('y1', (edge: any) => {
              const source = d3Nodes.find(n => n.id === edge.source);
              return source?.y || 0;
            })
            .attr('x2', (edge: any) => {
              const target = d3Nodes.find(n => n.id === edge.target);
              return target?.x || 0;
            })
            .attr('y2', (edge: any) => {
              const target = d3Nodes.find(n => n.id === edge.target);
              return target?.y || 0;
            });
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

      // Toggle photo on this node
      const photoEl = d3.select(this).select('.node-photo');
      const isVisible = photoEl.style('display') !== 'none';
      
      // Hide all photos first, reset all opacity
      container.selectAll('.node-photo').style('display', 'none');
      container.selectAll('g[id^="node-group-"]').style('opacity', 1);
      
      if (!isVisible) {
        photoEl.style('display', 'block');
        
        // Highlight adjacent nodes (parent + children), dim the rest
        const meta = typeof d.metadata === 'string' ? JSON.parse(d.metadata) : d.metadata || {};
        const parentName = meta.parent?.toLowerCase();
        
        container.selectAll('g[id^="node-group-"]').style('opacity', (n: any) => {
          const nMeta = typeof n.metadata === 'string' ? JSON.parse(n.metadata) : n.metadata || {};
          if (n.id === d.id) return 1;
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
      // Reset all photos and opacity when clicking background
      container.selectAll('.node-photo').style('display', 'none');
      container.selectAll('g[id^="node-group-"]').style('opacity', 1);
    });

  }, [data, selectedNodeId, filterType, validatePosition, hasOrphanedParent]);

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
