'use client';

// ============================================================
// SEARCH BAR (Ctrl+K) — nodes, documents and the text inside files
// ============================================================
// Uses MeiliSearch on the server (typo-tolerant, ranked); when it
// isn't running the backend searches PostgreSQL instead.
// Click a result:  node → select it · document → open it in its node's
// Docs · file → preview it (PDFs open at the page that matched).
// ↑ ↓ to move, Enter to open, Esc to close.
// ============================================================

import React, { useState, useRef, useEffect } from 'react';
import type { Node, FilterOptions, SortField } from '@/lib/types';
import Highlight from '@/lib/Highlight';
import { pageLabel } from '@/lib/files';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface SearchHit {
  kind: 'node' | 'doc' | 'file';
  refId: number;
  title: string;          // matches marked with \u0001 … \u0002
  snippet: string;
  nodeId: number | null;
  nodeName: string | null;
  page?: number | null;
  path?: string | null;
  mime?: string | null;
  sourceUrl?: string | null;
  documentId?: number | null;
}

interface UnifiedSearchBarProps {
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  nodeTypes: string[];
  allNodes: Node[];
  onSelectNode: (node: Node) => void;
  onOpenDocument?: (docId: number, nodeId: number | null) => void;
  onOpenFile?: (file: { id: number; name: string; path: string; mime: string | null; source_url?: string | null; document_id?: number | null }, page?: number | null) => void;
}

const ICON: Record<SearchHit['kind'], string> = { node: '⚪', doc: '📄', file: '📎' };
const plain = (s: string) => s.replace(/[\u0001\u0002]/g, '');

export default function UnifiedSearchBar({
  filters,
  onFilterChange,
  nodeTypes,
  allNodes,
  onSelectNode,
  onOpenDocument,
  onOpenFile,
}: UnifiedSearchBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [engine, setEngine] = useState('');
  const [active, setActive] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Search everything (server); if the server can't be reached, filter node names here
  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/mindmap/search/everything?q=${encodeURIComponent(searchQuery.trim())}`);
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          setResults(data.hits || []);
          setEngine(data.engine || '');
          setActive(0);
          setShowResults(true);
          return;
        }
      } catch { /* backend unavailable */ }
      if (cancelled) return;
      const lower = searchQuery.toLowerCase();
      setResults(allNodes
        .filter(n => n.name.toLowerCase().includes(lower) || n.description?.toLowerCase().includes(lower))
        .slice(0, 15)
        .map(n => ({ kind: 'node' as const, refId: n.id, title: n.name, snippet: n.description?.slice(0, 80) || '', nodeId: n.id, nodeName: n.name })));
      setEngine('offline');
      setActive(0);
      setShowResults(true);
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [searchQuery, allNodes]);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as HTMLElement)) {
        setShowResults(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Ctrl+K focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const open = (hit: SearchHit) => {
    if (hit.kind === 'node') {
      const node = allNodes.find(n => n.id === hit.refId);
      if (node) onSelectNode(node);
    } else if (hit.kind === 'doc') {
      onOpenDocument?.(hit.refId, hit.nodeId);
    } else if (hit.path) {
      onOpenFile?.({ id: hit.refId, name: plain(hit.title), path: hit.path, mime: hit.mime ?? null, source_url: hit.sourceUrl, document_id: hit.documentId }, hit.page);
    }
    setSearchQuery('');
    setShowResults(false);
  };

  const subtitle = (hit: SearchHit) => {
    const where = hit.kind === 'node' ? 'Node' : hit.nodeName || (hit.kind === 'doc' ? 'Unfiled' : 'no node');
    const page = hit.kind === 'file' && hit.page ? ` · ${pageLabel(hit.path || plain(hit.title))} ${hit.page}` : '';
    return `${hit.kind === 'doc' ? 'Document' : hit.kind === 'file' ? 'File' : ''}${hit.kind === 'node' ? where : ` · ${where}`}${page}`;
  };

  return (
    <div ref={wrapperRef} style={{
      display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px',
      background: '#252530', borderBottom: '1px solid #333', flexWrap: 'wrap',
      position: 'relative',
    }}>
      {/* Search Input */}
      <div style={{ position: 'relative', flex: '1 1 200px', minWidth: '150px' }}>
        <input
          ref={inputRef}
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          onFocus={() => { if (searchQuery.trim()) setShowResults(true); }}
          onKeyDown={e => {
            if (!showResults || !results.length) return;
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
            if (e.key === 'Enter') { e.preventDefault(); open(results[active]); }
            if (e.key === 'Escape') setShowResults(false);
          }}
          placeholder="Search nodes, docs and files… (Ctrl+K)"
          style={{
            background: '#1e1e2e', color: '#ccc', border: '1px solid #444',
            padding: '6px 10px', borderRadius: '4px', fontSize: '13px',
            width: '100%', outline: 'none',
          }}
        />
        {/* Dropdown results */}
        {showResults && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
            background: '#2a2a3a', border: '1px solid #444', borderRadius: '0 0 4px 4px',
            maxHeight: '420px', overflow: 'auto', minWidth: 320,
          }}>
            {results.length === 0 && <div style={{ padding: '10px 12px', color: '#777', fontSize: 12 }}>Nothing found.</div>}
            {results.map((hit, i) => (
              <div key={`${hit.kind}-${hit.refId}-${hit.page ?? 0}`}
                onMouseDown={e => { e.preventDefault(); open(hit); }}
                onMouseEnter={() => setActive(i)}
                style={{
                  padding: '7px 12px', cursor: 'pointer', borderBottom: '1px solid #333', color: '#ccc',
                  background: i === active ? '#353548' : 'transparent',
                }}
              >
                <div style={{ fontSize: '13px', display: 'flex', gap: 6, alignItems: 'baseline' }}>
                  <span>{ICON[hit.kind]}</span>
                  <Highlight text={hit.title} style={{ fontWeight: 600, color: '#eee' }} />
                  <span style={{ fontSize: 11, color: '#777', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{subtitle(hit)}</span>
                </div>
                {hit.snippet && <Highlight text={hit.snippet} style={{ display: 'block', fontSize: '11px', color: '#999', marginTop: 2, lineHeight: 1.4 }} />}
              </div>
            ))}
            {engine && (
              <div style={{ padding: '4px 12px', fontSize: 10, color: '#666', textAlign: 'right' }}>
                {engine === 'meilisearch' ? 'MeiliSearch' : engine === 'postgres' ? 'database search (MeiliSearch not running)' : 'offline — node names only'}
              </div>
            )}
          </div>
        )}
      </div>
 
      {/* Filter by Type */}
      <select
        value={filters.type || 'all'}
        onChange={e => onFilterChange({ ...filters, type: e.target.value === 'all' ? undefined : e.target.value })}
        style={{
          background: '#1e1e2e', color: '#ccc', border: '1px solid #444',
          padding: '6px 8px', borderRadius: '4px', fontSize: '12px',
        }}
      >
        <option value="all">All Types</option>
        {nodeTypes.map(t => (
          <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
        ))}
      </select>
 
      {/* Sort By */}
      <select
        value={filters.sortBy || 'name'}
        onChange={e => onFilterChange({ ...filters, sortBy: e.target.value as SortField })}
        style={{
          background: '#1e1e2e', color: '#ccc', border: '1px solid #444',
          padding: '6px 8px', borderRadius: '4px', fontSize: '12px',
        }}
      >
        <option value="name">Name</option>
        <option value="created_at">Date</option>
        <option value="type">Type</option>
      </select>
 
      {/* Sort Direction */}
      <button
        onClick={() => onFilterChange({ ...filters, sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' })}
        style={{
          background: '#1e1e2e', color: '#ccc', border: '1px solid #444',
          padding: '6px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
        }}
      >
        {filters.sortDir === 'asc' ? '↑' : '↓'}
      </button>
 
      {/* Bookmarked Only */}
      <label style={{ color: '#888', fontSize: '12px', display: 'flex', gap: '4px', alignItems: 'center', whiteSpace: 'nowrap' }}>
        <input
          type="checkbox"
          checked={filters.bookmarkedOnly || false}
          onChange={e => onFilterChange({ ...filters, bookmarkedOnly: e.target.checked })}
        />
        ★ Only
      </label>
    </div>
  );
}