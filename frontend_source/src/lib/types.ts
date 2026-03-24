// ============================================================
// TYPES - Shared TypeScript Definitions
// ============================================================
// PURPOSE: Define the "shape" of data used throughout the app.
//
// WHY TYPES?
// - Catch bugs at compile time (before running)
// - Better autocomplete in VS Code
// - Self-documenting code
//
// CONVENTION:
// - Interfaces for objects with properties
// - Types for unions, aliases, and complex types
// ============================================================

// ============================================================
// NODE - A single item in the mindmap
// ============================================================
// This matches what comes from the backend API.
// Every circle/box in the graph is a Node.
// ============================================================
export interface Node {
  id: number;            // Unique identifier from PostgreSQL
  name: string;          // Display name shown on the node
  description: string;   // Longer text content
  metadata: NodeMetadata; // Flexible JSON data
  x: number;             // Horizontal position on canvas
  y: number;             // Vertical position on canvas
  created_at?: string;   // ISO timestamp of creation
}

// ============================================================
// NODE METADATA - Flexible properties attached to nodes
// ============================================================
// Stored as JSONB in PostgreSQL, so it can hold anything.
// These are the known fields we use.
// ============================================================
export interface NodeMetadata {
  type?: 'person' | 'medical' | 'concept' | 'location' | 'default';
  parent?: string;        // Name of parent node (for relationships)
  source?: string;        // Where this node was created from
  
  // Visual customization
  color?: string;         // Override node color
  icon?: string;          // Icon to display
  
  // Feature data
  formula?: string;       // KaTeX formula string
  chartConfig?: ChartConfig;  // Chart/graph configuration
  
  // State flags
  collapsed?: boolean;    // Hide children in graph view
  pinned?: boolean;       // Keep visible even when parent collapsed
  alwaysVisible?: boolean; // Never auto-hide
  
  // Annotations (for drawing on images)
  annotations?: Annotation[];
  
  // Arbitrary extra data
  [key: string]: any;
}

// ============================================================
// CHART CONFIG - Configuration for embedded charts
// ============================================================
// Supports multiple chart/graph types:
// - chartjs: Chart.js JSON configuration
// - desmos: Desmos calculator embed
// - geogebra: GeoGebra math visualization
// - custom: Any iframe URL
// ============================================================
export interface ChartConfig {
  type: 'chartjs' | 'desmos' | 'geogebra' | 'custom';
  
  // For Chart.js
  chartjsConfig?: {
    type: 'line' | 'bar' | 'pie' | 'doughnut' | 'radar' | 'scatter';
    data: any;
    options?: any;
  };
  
  // For Desmos
  desmosUrl?: string;     // Share URL from Desmos
  
  // For GeoGebra
  geogebraUrl?: string;   // Share URL from GeoGebra
  
  // For custom embeds
  customUrl?: string;     // Any iframe-embeddable URL
  
  // Display settings
  height?: number;        // Chart height in pixels
  width?: number;         // Chart width in pixels
}

// ============================================================
// ANNOTATION - Drawings/markers on image nodes
// ============================================================
export interface Annotation {
  x: number;              // X position (0-100% of image width)
  y: number;              // Y position (0-100% of image height)
  text: string;           // Label text
  color?: string;         // Marker color
  type?: 'point' | 'arrow' | 'box' | 'circle';
}

// ============================================================
// TAB - Browser-like tabs in the UI
// ============================================================
// The app has a tab bar like Chrome.
// Each tab can show different content.
// ============================================================
export interface Tab {
  id: string;             // Unique identifier
  title: string;          // Tab label
  type: 'graph' | 'node' | 'new' | 'workspace' | 'calendar' | 'scheduler' | 'mindmap' | 'finance' | 'newsfeed' | 'quiz'; // Content type
  nodeId?: number;        // If type='node', which node is open
}

// ============================================================
// EDGE/LINK - Connection between nodes
// ============================================================
// Represents the lines drawn between nodes in the graph.
// ============================================================
export interface Edge {
  id?: string;
  source: number | Node;  // Source node ID or object
  target: number | Node;  // Target node ID or object
  label?: string;         // Text on the line
  type?: string;          // Relationship type (CHILD_OF, etc.)
}

// ============================================================
// PANEL - A resizable panel in the workspace
// ============================================================
// When you double-click a node, it opens in a workspace
// with multiple panels (notes, formula, chart, etc.)
// ============================================================
export interface Panel {
  id: string;
  type: 'etherpad' | 'formula' | 'chart' | 'preview' | 'custom' | 'excalidraw' | 'map';
  title: string;
  width: number;          // Width in pixels or percentage
  minimized?: boolean;
  maximized?: boolean;
}

// ============================================================
// CONTEXT MENU ITEM - Right-click menu options
// ============================================================
export interface ContextMenuItem {
  label: string;
  icon?: string;
  action: () => void;
  disabled?: boolean;
  divider?: boolean;      // Show a line after this item
  danger?: boolean;       // Red text for destructive actions
}

// ============================================================
// DRAG STATE - Tracks mouse dragging
// ============================================================
// Used to detect if a click was actually a drag.
// ============================================================
export interface DragState {
  isDragging: boolean;
  startX: number;
  startY: number;
  nodeId: number | null;
  hasMoved: boolean;      // True if mouse moved beyond threshold
}

// ============================================================
// API RESPONSE TYPES
// ============================================================
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CreateNodeRequest {
  name: string;
  description?: string;
  type?: string;
  metadata?: Partial<NodeMetadata>;
  x?: number;
  y?: number;
}

export interface UpdateNodeRequest {
  name?: string;
  description?: string;
  metadata?: Partial<NodeMetadata>;
  x?: number;
  y?: number;
}
// ============================================================
// BOOKMARK - Saved node references
// ============================================================
export interface Bookmark {
  id: string;
  nodeId: number;
  nodeName: string;
  createdAt: string;
  color?: string;        // Optional color label
  group?: string;        // Folder/category
}

// ============================================================
// CALENDAR EVENT - For scheduler/itinerary
// ============================================================
export interface CalendarEvent {
  id: string;
  title: string;
  start: string;         // ISO date
  end?: string;
  nodeId?: number;       // Link to a mindmap node
  color?: string;
}

// ============================================================
// MAP MARKER - For placing nodes on maps
// ============================================================
export interface MapMarker {
  nodeId: number;
  lat: number;
  lng: number;
  label?: string;
}

// ============================================================
// PANE - For Obsidian-style mosaic layout
// ============================================================
export type PaneType =
  | 'graph'
  | 'inspector'
  | 'search'
  | 'bookmarks'
  | 'calendar'
  | 'scheduler'
  | 'mindmap'
  | 'excalidraw'
  | 'map'
  | 'workspace'
  | 'node';

export interface PaneConfig {
  id: string;
  type: PaneType;
  title: string;
  nodeId?: number;       // For node-specific panes
}

// ============================================================
// FILTER/SORT OPTIONS
// ============================================================
export type SortField = 'name' | 'created_at' | 'type' | 'x';
export type SortDirection = 'asc' | 'desc';

export interface FilterOptions {
  type?: string;
  search?: string;
  bookmarkedOnly?: boolean;
  sortBy?: SortField;
  sortDir?: SortDirection;
}

// ============================================================
// TAB - Updated with new types
// ============================================================
// Add to existing Tab interface's type union:
// type: 'graph' | 'node' | 'new' | 'workspace' | 'calendar'
//     | 'scheduler' | 'mindmap' | 'excalidraw' | 'map';

// ============================================================
// MINDMAP COLLECTION - Saved sub-views (Family Tree, Goals, Journals, etc.)
// ============================================================
export interface MindmapCollection {
  id: string;
  name: string;
  icon: string;
  description?: string;
  nodeIds: number[];          // Which nodes belong to this collection
  createdAt: string;
  color?: string;
  mapOverlay?: {              // Optional map/diagram background
    type: 'geographic' | 'diagram' | 'image';
    url?: string;             // Image/diagram URL if not geographic
    center?: { lat: number; lng: number };
    zoom?: number;
  };
}