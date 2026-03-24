'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { Node } from '@/lib/types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

interface SearchModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectNode: (node: Node) => void;
  allNodes: Node[];
}

export default function SearchModal({ visible, onClose, onSelectNode, allNodes }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Node[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      inputRef.current?.focus();
      setQuery('');
      setResults([]);
    }
  }, [visible]);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    // Try MeiliSearch first, fall back to local filter
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/search/indexes/nodes/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: query, limit: 20 }),
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data.hits || []);
          return;
        }
      } catch {
        // MeiliSearch unavailable — fall back to local
      }

      // Local fallback
      const lower = query.toLowerCase();
      setResults(
        allNodes.filter(n =>
          n.name.toLowerCase().includes(lower) ||
          n.description?.toLowerCase().includes(lower)
        ).slice(0, 20)
      );
    }, 200);

    return () => clearTimeout(timer);
  }, [query, allNodes]);

  // Keyboard shortcut: Escape to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (visible) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
      display: 'flex', justifyContent: 'center', paddingTop: '15vh', zIndex: 9999,
    }} onClick={onClose}>
      <div style={{
        background: '#252530', borderRadius: '8px', width: '500px',
        maxHeight: '400px', display: 'flex', flexDirection: 'column',
        border: '1px solid #444',
      }} onClick={e => e.stopPropagation()}>
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search nodes..."
          style={{
            background: 'transparent', border: 'none', borderBottom: '1px solid #333',
            padding: '14px 16px', color: '#fff', fontSize: '16px', outline: 'none',
          }}
        />
        <div style={{ overflow: 'auto', flex: 1 }}>
          {results.map(node => (
            <div
              key={node.id}
              onClick={() => { onSelectNode(node); onClose(); }}
              style={{
                padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #2a2a2a',
                color: '#ccc',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#333')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ fontWeight: 'bold' }}>{node.name}</div>
              <div style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>
                {node.description?.slice(0, 80) || 'No description'}
              </div>
            </div>
          ))}
          {query && results.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
              No results found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}