'use client';

import React from 'react';
import type { Node, Bookmark } from '@/lib/types';

interface BookmarkPanelProps {
  bookmarks: Bookmark[];
  onSelectNode: (nodeId: number) => void;
  onRemoveBookmark: (bookmarkId: string) => void | Promise<void>;
}

export default function BookmarkPanel({ bookmarks, onSelectNode, onRemoveBookmark }: BookmarkPanelProps) {
  return (
    <div style={{ padding: '12px', height: '100%', overflow: 'auto', background: '#1e1e2e' }}>
      <h3 style={{ color: '#aaa', fontSize: '13px', marginBottom: '12px', textTransform: 'uppercase' }}>
        Bookmarks ({bookmarks.length})
      </h3>
      {bookmarks.length === 0 && (
        <p style={{ color: '#555', fontSize: '13px' }}>
          Right-click a node and select "Bookmark" to save it here.
        </p>
      )}
      {bookmarks.map(bm => (
        <div key={bm.id} style={{
          display: 'flex', alignItems: 'center', padding: '8px',
          borderRadius: '4px', cursor: 'pointer', marginBottom: '4px',
          background: '#2a2a3a',
        }}
          onClick={() => onSelectNode(bm.nodeId)}
        >
          <span style={{ flex: 1, color: '#ccc', fontSize: '14px' }}>{bm.nodeName}</span>
          <button
            onClick={(e) => { e.stopPropagation(); onRemoveBookmark(bm.id); }}
            style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}