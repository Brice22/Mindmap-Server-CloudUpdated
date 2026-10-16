'use client';

// ============================================================
// NODE PHOTO (Inspector) — the node's photo above its Quick Notes
// ============================================================
// Upload / change / remove the photo, and choose whether it also
// shows inside the node on the graph. Photos are stored in
// cloud_data through the normal upload endpoint (/uploads/...).
// ============================================================

import React, { useRef, useState } from 'react';
import type { Node } from '@/lib/types';
import { photoUrl } from '../MindMapGraph';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

interface NodePhotoPanelProps {
  node: Node;
  onUpdateNode: (nodeId: number, updates: Partial<Node>) => void;
}

const btn: React.CSSProperties = { background: '#333', color: '#ccc', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 11, cursor: 'pointer' };

export default function NodePhotoPanel({ node, onUpdateNode }: NodePhotoPanelProps) {
  const meta: any = typeof node.metadata === 'string' ? JSON.parse(node.metadata || '{}') : node.metadata || {};
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [failed, setFailed] = useState(false);

  const upload = async (file: File) => {
    setUploading(true);
    setFailed(false);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_URL}/api/mindmap/upload`, { method: 'POST', body: form });
      if (!res.ok) throw new Error();
      const { url } = await res.json();
      onUpdateNode(node.id, { metadata: { photo: url, photoOnNode: meta.photoOnNode ?? true } } as any);
    } catch {
      setFailed(true);
    }
    setUploading(false);
  };

  const picker = (
    <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
      onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
  );

  if (!meta.photo) {
    return (
      <div style={{ marginBottom: 16 }}>
        {picker}
        <div onClick={() => inputRef.current?.click()}
          style={{ border: '1px dashed #444', borderRadius: 4, padding: 12, textAlign: 'center', color: '#666', fontSize: 13, cursor: 'pointer' }}>
          {uploading ? 'Uploading…' : failed ? 'Upload failed — click to try again' : '🖼️ Add a photo'}
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: 16 }}>
      {picker}
      <img src={photoUrl(meta.photo)} alt={node.name}
        style={{ width: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 4, background: '#111', display: 'block' }} />
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <button onClick={() => inputRef.current?.click()} style={btn}>{uploading ? 'Uploading…' : 'Change'}</button>
        <button onClick={() => onUpdateNode(node.id, { metadata: { photoOnNode: meta.photoOnNode === false } } as any)} style={btn}>
          {meta.photoOnNode === false ? 'Show on node' : 'Hide on node'}
        </button>
        <button onClick={() => { if (confirm('Remove this photo?')) onUpdateNode(node.id, { metadata: { photo: null } } as any); }}
          style={{ ...btn, color: '#ef4444' }}>Remove</button>
      </div>
    </div>
  );
}