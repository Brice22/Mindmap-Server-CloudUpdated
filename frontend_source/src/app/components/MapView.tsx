'use client';

import React, { useEffect, useState, useRef } from 'react';
import type { Node, MapMarker } from '@/lib/types';

// Install: bun add leaflet react-leaflet @types/leaflet

interface MapViewProps {
  nodes: Node[];
  markers: MapMarker[];
  onAddMarker: (nodeId: number, lat: number, lng: number) => void;
  onNodeClick: (node: Node) => void;
}

export default function MapView({ nodes, markers, onAddMarker, onNodeClick }: MapViewProps) {
  const [LeafletComponents, setLeaflet] = useState<any>(null);
  const [selectedNodeForPin, setSelectedNodeForPin] = useState<number | null>(null);

  useEffect(() => {
    // Dynamic import for SSR compatibility
    Promise.all([
      import('react-leaflet'),
      import('leaflet'),
    ]).then(([rl, L]) => {
      // Fix default marker icons (Leaflet/Webpack issue)
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });
      setLeaflet(rl);
    }).catch(() => {
      console.warn('Leaflet not installed. Run: bun add leaflet react-leaflet');
    });
  }, []);

  if (!LeafletComponents) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: '#666', background: '#1e1e2e',
      }}>
        Loading Map... (run `bun add leaflet react-leaflet` if not installed)
      </div>
    );
  }

  const { MapContainer, TileLayer, Marker, Popup, useMapEvents } = LeafletComponents;

  // Component to handle map clicks for pinning nodes
  function ClickHandler() {
    useMapEvents({
      click(e: any) {
        if (selectedNodeForPin !== null) {
          onAddMarker(selectedNodeForPin, e.latlng.lat, e.latlng.lng);
          setSelectedNodeForPin(null);
        }
      },
    });
    return null;
  }

  return (
    <div style={{ height: '100%', position: 'relative' }}>
      {/* Node selector for pinning */}
      <div style={{
        position: 'absolute', top: 10, left: 60, zIndex: 1000,
        background: '#252530', padding: '8px', borderRadius: '4px',
        border: '1px solid #444',
      }}>
        <select
          value={selectedNodeForPin || ''}
          onChange={e => setSelectedNodeForPin(e.target.value ? Number(e.target.value) : null)}
          style={{ background: '#333', color: '#ccc', border: '1px solid #444', padding: '4px', borderRadius: '4px' }}
        >
          <option value="">Click map to pin node...</option>
          {nodes.map(n => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>
      </div>

      <MapContainer
        center={[39.8283, -98.5795]}  // Center of US — adjust to your preference
        zoom={4}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="OpenStreetMap"
        />
        <ClickHandler />
        {markers.map(marker => {
          const node = nodes.find(n => n.id === marker.nodeId);
          return (
            <Marker key={`${marker.nodeId}-${marker.lat}`} position={[marker.lat, marker.lng]}>
              <Popup>
                <div onClick={() => node && onNodeClick(node)} style={{ cursor: 'pointer' }}>
                  <strong>{node?.name || 'Unknown'}</strong>
                  <br />
                  {marker.label || node?.description?.slice(0, 50)}
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>
    </div>
  );
}