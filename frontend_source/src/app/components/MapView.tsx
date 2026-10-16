'use client';

// ============================================================
// MAP VIEW - a node's map, with areas, pins and toggle overlays
// ============================================================
// - Area: a node can be "zoomed into" a city/region/place. Search
//   for it (outline drawn when OpenStreetMap has one) or use the
//   current view. Opening this map zooms straight to the area.
//   Nodes with an area count as "containing" places: a 📍 place in
//   any doc that falls inside it becomes a backlink on the node.
// - Pins: pick a node, click the map — the node is pinned here
//   (also a backlink). Click a pin to remove it.
// - Overlays (toggle): this node, child nodes, linked nodes, nodes
//   inside this area, 📍 places from docs, all nodes with a place.
// Only nodes that have an area or a pin appear on maps.
// ============================================================

import React, { useEffect, useMemo, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import type { Node, MapMarker } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface MapArea {
  label: string;
  lat: number;
  lng: number;
  zoom?: number;
  bbox: [number, number, number, number];   // [south, north, west, east]
  geojson?: any;                             // outline (Polygon/MultiPolygon), if any
}

type LayerKey = 'self' | 'children' | 'linked' | 'inside' | 'places' | 'all';
export type MapLayers = Record<LayerKey, boolean>;

const LAYERS: { key: LayerKey; label: string; color: string }[] = [
  { key: 'self', label: 'This node', color: '#3b82f6' },
  { key: 'children', label: 'Child nodes', color: '#22c55e' },
  { key: 'linked', label: 'Linked nodes', color: '#f59e0b' },
  { key: 'inside', label: 'Nodes inside this area', color: '#a855f7' },
  { key: 'places', label: '📍 Places in docs', color: '#ef4444' },
  { key: 'all', label: 'All nodes with a place', color: '#9ca3af' },
];
const DEFAULT_LAYERS: MapLayers = { self: true, children: true, linked: true, inside: true, places: true, all: false };

interface GeoResult { label: string; name: string; type: string; lat: number; lng: number; bbox: [number, number, number, number] | null; geojson: any }
interface DocPlace { name: string; lat: number; lng: number; doc_title: string; node_name: string | null }

interface MapViewProps {
  node: Node;
  area: MapArea | null;
  markers: MapMarker[];
  layers?: Partial<MapLayers>;
  onSaveArea: (area: MapArea | null) => void;
  onSaveMarkers: (markers: MapMarker[]) => void;
  onSaveLayers: (layers: MapLayers) => void;
}

function metaOf(n: Node): any {
  return typeof n.metadata === 'string' ? JSON.parse(n.metadata || '{}') : n.metadata || {};
}

function inBox(lat: number, lng: number, b: [number, number, number, number]) {
  return lat >= b[0] && lat <= b[1] && lng >= b[2] && lng <= b[3];
}

// Small helpers that need react-leaflet's hooks (passed in as `rl` because it loads in the browser only)
function FitTo({ rl, bounds, fitKey }: { rl: any; bounds: [[number, number], [number, number]] | null; fitKey: string }) {
  const map = rl.useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [20, 20], maxZoom: 15 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey]);
  return null;
}

function ClickToPin({ rl, onClick }: { rl: any; onClick: (lat: number, lng: number) => void }) {
  rl.useMapEvents({ click(e: any) { onClick(e.latlng.lat, e.latlng.lng); } });
  return null;
}

export default function MapView({ node, area: initialArea, markers: initialMarkers, layers: savedLayers, onSaveArea, onSaveMarkers, onSaveLayers }: MapViewProps) {
  const [rl, setRl] = useState<any>(null);
  const [map, setMap] = useState<any>(null);
  const [area, setArea] = useState<MapArea | null>(initialArea);
  const [markers, setMarkers] = useState<MapMarker[]>(initialMarkers || []);
  const [layers, setLayers] = useState<MapLayers>({ ...DEFAULT_LAYERS, ...(savedLayers || {}) });
  const [allNodes, setAllNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<{ source: number; target: number }[]>([]);
  const [nodePlaces, setNodePlaces] = useState<DocPlace[]>([]);
  const [allPlaces, setAllPlaces] = useState<DocPlace[]>([]);
  const [pinNodeId, setPinNodeId] = useState<number | null>(null);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeoResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [fitKey, setFitKey] = useState('initial');

  // Leaflet needs the browser — load it after mount, with marker icons served by this app
  useEffect(() => {
    Promise.all([import('react-leaflet'), import('leaflet')]).then(([reactLeaflet, L]) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: (markerIcon as any).src || markerIcon,
        iconRetinaUrl: (markerIcon2x as any).src || markerIcon2x,
        shadowUrl: (markerShadow as any).src || markerShadow,
      });
      setRl(reactLeaflet);
    }).catch(() => console.warn('Leaflet failed to load'));
  }, []);

  // Everything the overlays need
  useEffect(() => {
    const get = (path: string) => fetch(`${API_URL}${path}`).then(r => (r.ok ? r.json() : [])).catch(() => []);
    get('/api/mindmap').then(rows => setAllNodes(Array.isArray(rows) ? rows : []));
    get('/api/mindmap/backlinks/edges').then(rows => setEdges(Array.isArray(rows) ? rows : []));
    get(`/api/mindmap/node/${node.id}/places`).then(rows => setNodePlaces(Array.isArray(rows) ? rows : []));
    get('/api/mindmap/places').then(rows => setAllPlaces(Array.isArray(rows) ? rows : []));
  }, [node.id]);

  // Where every node is: its area and any pins of it (on any node's map; this map's pins from local state)
  const locations = useMemo(() => {
    const byId = new Map<number, { node: Node; area: MapArea | null; pins: { lat: number; lng: number; owner: number }[] }>();
    const list = allNodes.length ? allNodes : [node];
    for (const n of list) byId.set(n.id, { node: n, area: n.id === node.id ? area : metaOf(n).mapArea || null, pins: [] });
    for (const n of list) {
      const pins: MapMarker[] = n.id === node.id ? markers : metaOf(n).mapMarkers || [];
      for (const p of pins) byId.get(p.nodeId)?.pins.push({ lat: p.lat, lng: p.lng, owner: n.id });
    }
    return byId;
  }, [allNodes, node, area, markers]);

  // Which overlay each node belongs to (first match wins: this node, children, linked, inside, all)
  const overlay = useMemo(() => {
    const result: { node: Node; area: MapArea | null; pins: { lat: number; lng: number; owner: number }[]; layer: LayerKey }[] = [];
    const linkedIds = new Set<number>();
    for (const e of edges) {
      if (e.source === node.id) linkedIds.add(e.target);
      if (e.target === node.id) linkedIds.add(e.source);
    }
    for (const loc of Array.from(locations.values())) {
      const n = loc.node;
      if (!loc.area && loc.pins.length === 0) continue;   // no place → not on the map
      const isChild = (metaOf(n).parent || '').toLowerCase() === node.name.toLowerCase();
      const points = [...loc.pins, ...(loc.area ? [{ lat: loc.area.lat, lng: loc.area.lng }] : [])];
      const inside = !!area && n.id !== node.id && points.some(p => inBox(p.lat, p.lng, area.bbox));
      const layer: LayerKey | null =
        n.id === node.id ? 'self'
        : isChild && layers.children ? 'children'
        : linkedIds.has(n.id) && layers.linked ? 'linked'
        : inside && layers.inside ? 'inside'
        : layers.all ? 'all'
        : null;
      if (layer && layers[layer]) result.push({ ...loc, layer });
    }
    return result;
  }, [locations, edges, node, area, layers]);

  const places = layers.places ? (layers.all ? allPlaces : nodePlaces) : [];

  // What to zoom to when the map opens or the area changes
  const bounds = useMemo((): [[number, number], [number, number]] | null => {
    if (area) return [[area.bbox[0], area.bbox[2]], [area.bbox[1], area.bbox[3]]];
    const pts = [...markers, ...nodePlaces];
    if (pts.length === 0) return null;
    const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng);
    return [[Math.min(...lats) - 0.01, Math.min(...lngs) - 0.01], [Math.max(...lats) + 0.01, Math.max(...lngs) + 0.01]];
  }, [area, markers, nodePlaces]);

  // Re-fit once the doc places have loaded (only if there's no area or pins to fit to)
  useEffect(() => {
    if (!area && markers.length === 0 && nodePlaces.length) setFitKey(`places-${nodePlaces.length}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodePlaces.length]);

  // ---------------- actions ----------------
  const runSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/api/mindmap/geocode?q=${encodeURIComponent(query.trim())}`);
      setResults(res.ok ? await res.json() : []);
    } catch {
      setResults([]);
    }
    setSearching(false);
  };

  const chooseArea = (r: GeoResult) => {
    const bbox = r.bbox || [r.lat - 0.02, r.lat + 0.02, r.lng - 0.02, r.lng + 0.02];
    const next: MapArea = { label: r.name || r.label, lat: r.lat, lng: r.lng, bbox, geojson: r.geojson || undefined };
    setArea(next);
    onSaveArea(next);
    setShowSearch(false);
    setResults(null);
    setFitKey(`area-${Date.now()}`);
  };

  const useCurrentView = () => {
    if (!map) return;
    const b = map.getBounds();
    const c = map.getCenter();
    const label = window.prompt('Name for this area', area?.label || node.name);
    if (label === null) return;
    const next: MapArea = {
      label: label || node.name, lat: c.lat, lng: c.lng, zoom: map.getZoom(),
      bbox: [b.getSouth(), b.getNorth(), b.getWest(), b.getEast()],
    };
    setArea(next);
    onSaveArea(next);
  };

  const clearArea = () => {
    if (!confirm('Remove this node\'s map area?')) return;
    setArea(null);
    onSaveArea(null);
  };

  const addPin = (lat: number, lng: number) => {
    if (pinNodeId == null) return;
    const next = [...markers, { nodeId: pinNodeId, lat, lng }];
    setMarkers(next);
    onSaveMarkers(next);
    setPinNodeId(null);
  };

  const removePin = (index: number) => {
    const next = markers.filter((_, i) => i !== index);
    setMarkers(next);
    onSaveMarkers(next);
  };

  const toggleLayer = (key: LayerKey) => {
    const next = { ...layers, [key]: !layers[key] };
    setLayers(next);
    onSaveLayers(next);
  };

  if (!rl) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', background: '#1e1e2e' }}>Loading map…</div>;
  }

  const { MapContainer, TileLayer, Marker, Popup, CircleMarker, GeoJSON, Tooltip, Rectangle } = rl;
  const colorOf = (layer: LayerKey) => LAYERS.find(l => l.key === layer)!.color;
  const nameOf = (id: number) => locations.get(id)?.node.name || 'Unknown node';
  const pinning = pinNodeId != null;

  const btn: React.CSSProperties = { background: '#333', color: '#ddd', border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, cursor: 'pointer' };
  const field: React.CSSProperties = { background: '#1e1e2e', color: '#ddd', border: '1px solid #444', borderRadius: 4, padding: '3px 6px', fontSize: 12 };

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {/* ---------- Controls ---------- */}
      <div style={{
        position: 'absolute', top: 10, left: 54, zIndex: 1000, width: 270, maxHeight: 'calc(100% - 20px)', overflowY: 'auto',
        background: '#252530ee', border: '1px solid #444', borderRadius: 6, padding: 8, color: '#ccc', fontSize: 12,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong style={{ color: '#fff' }}>🗺️ {node.name}</strong>
          <button onClick={() => setPanelOpen(o => !o)} style={btn}>{panelOpen ? '▾' : '▸'}</button>
        </div>
        {panelOpen && (
          <>
            {/* Area */}
            <div style={{ marginTop: 8 }}>
              <div style={{ color: '#888', fontSize: 11 }}>AREA</div>
              <div style={{ margin: '2px 0 4px' }}>{area ? area.label : <span style={{ color: '#666' }}>None — this node isn't tied to a place</span>}</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                <button onClick={() => setShowSearch(s => !s)} style={btn}>🔍 Set area</button>
                <button onClick={useCurrentView} style={btn} title="Use what the map shows now">Use this view</button>
                {area && <button onClick={clearArea} style={btn}>Clear</button>}
              </div>
              {showSearch && (
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') runSearch(); }}
                      placeholder="City, region, address, venue…" style={{ ...field, flex: 1, minWidth: 0 }} />
                    <button onClick={runSearch} style={btn}>{searching ? '…' : 'Search'}</button>
                  </div>
                  {results && results.length === 0 && <div style={{ color: '#888', marginTop: 4 }}>No results (or search unavailable).</div>}
                  {results && results.map((r, i) => (
                    <div key={i} onClick={() => chooseArea(r)}
                      style={{ padding: '4px 2px', borderBottom: '1px solid #333', cursor: 'pointer' }}>
                      <div style={{ color: '#60a5fa' }}>{r.name} <span style={{ color: '#777' }}>· {r.type}{r.geojson ? ' · outline' : ''}</span></div>
                      <div style={{ color: '#777', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pins */}
            <div style={{ marginTop: 10 }}>
              <div style={{ color: '#888', fontSize: 11 }}>PIN A NODE HERE</div>
              <select value={pinNodeId ?? ''} onChange={e => setPinNodeId(e.target.value ? Number(e.target.value) : null)}
                style={{ ...field, width: '100%', marginTop: 2 }}>
                <option value="">Choose a node, then click the map…</option>
                {(allNodes.length ? allNodes : [node]).map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
              {pinNodeId != null && <div style={{ color: '#f59e0b', marginTop: 2 }}>Click the map to place “{nameOf(pinNodeId)}”</div>}
            </div>

            {/* Overlays */}
            <div style={{ marginTop: 10 }}>
              <div style={{ color: '#888', fontSize: 11 }}>OVERLAYS</div>
              {LAYERS.map(l => (
                <label key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, cursor: 'pointer',
                  opacity: l.key === 'inside' && !area ? 0.5 : 1 }}>
                  <input type="checkbox" checked={layers[l.key]} onChange={() => toggleLayer(l.key)} />
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: l.color, display: 'inline-block' }} />
                  {l.label}
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ---------- Map ---------- */}
      <MapContainer
        ref={setMap}
        center={area ? [area.lat, area.lng] : [39.8283, -98.5795]}
        zoom={area?.zoom || 4}
        style={{ height: '100%', width: '100%', cursor: pinNodeId != null ? 'crosshair' : undefined }}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="© OpenStreetMap contributors" />
        <FitTo rl={rl} bounds={bounds} fitKey={fitKey} />
        <ClickToPin rl={rl} onClick={addPin} />

        {/* Areas and locations of nodes in the switched-on overlays.
            While pinning they ignore clicks, so a click inside an area places the pin. */}
        {overlay.map(o => {
          const color = colorOf(o.layer);
          const mode = pinning ? 'pin' : 'view';
          const info = (
            <div style={{ maxWidth: 220 }}>
              <strong>{o.node.name}</strong>
              {o.area && <div style={{ fontSize: 11 }}>📍 {o.area.label}</div>}
              {o.node.description && <div style={{ fontSize: 11, marginTop: 2 }}>{o.node.description.slice(0, 160)}</div>}
            </div>
          );
          return (
            <React.Fragment key={`o-${o.node.id}`}>
              {o.area?.geojson && (
                <GeoJSON key={`g-${o.node.id}-${o.area.label}-${mode}`} data={o.area.geojson} interactive={!pinning}
                  style={{ color, weight: 2, fillOpacity: o.layer === 'self' ? 0.06 : 0.12 }}>
                  <Tooltip sticky>{o.node.name}</Tooltip>
                  <Popup>{info}</Popup>
                </GeoJSON>
              )}
              {o.area && !o.area.geojson && o.layer === 'self' && (
                <Rectangle key={`r-${mode}`} bounds={[[o.area.bbox[0], o.area.bbox[2]], [o.area.bbox[1], o.area.bbox[3]]]}
                  interactive={false} pathOptions={{ color, weight: 1.5, dashArray: '6,4', fillOpacity: 0.03 }} />
              )}
              {o.area && !o.area.geojson && o.layer !== 'self' && (
                <CircleMarker key={`c-${mode}`} center={[o.area.lat, o.area.lng]} radius={8} interactive={!pinning} pathOptions={{ color, fillOpacity: 0.5 }}>
                  <Tooltip>{o.node.name}</Tooltip>
                  <Popup>{info}</Popup>
                </CircleMarker>
              )}
              {/* pins on other nodes' maps (this map's own pins are drawn as markers below) */}
              {o.node.id !== node.id && o.pins.filter(p => p.owner !== node.id).map((p, i) => (
                <CircleMarker key={`${i}-${mode}`} center={[p.lat, p.lng]} radius={6} interactive={!pinning} pathOptions={{ color, fillOpacity: 0.7 }}>
                  <Tooltip>{o.node.name}</Tooltip>
                  <Popup>{info}</Popup>
                </CircleMarker>
              ))}
            </React.Fragment>
          );
        })}

        {/* Pins placed on this node's map */}
        {markers.map((m, i) => (
          <Marker key={`m-${i}-${m.lat}-${m.lng}`} position={[m.lat, m.lng]}>
            <Tooltip>{nameOf(m.nodeId)}</Tooltip>
            <Popup>
              <div style={{ maxWidth: 220 }}>
                <strong>{nameOf(m.nodeId)}</strong>
                {m.label && <div style={{ fontSize: 11 }}>{m.label}</div>}
                <button onClick={() => removePin(i)} style={{ marginTop: 6, fontSize: 11, cursor: 'pointer' }}>Remove pin</button>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* 📍 places written in docs with /place */}
        {places.map((p, i) => (
          <CircleMarker key={`p-${i}-${pinning}`} center={[p.lat, p.lng]} radius={5} interactive={!pinning} pathOptions={{ color: colorOf('places'), fillOpacity: 0.8 }}>
            <Tooltip>📍 {p.name}</Tooltip>
            <Popup>
              <div style={{ maxWidth: 220 }}>
                <strong>📍 {p.name}</strong>
                <div style={{ fontSize: 11 }}>in “{p.doc_title}”{p.node_name ? ` · ${p.node_name}` : ''}</div>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}