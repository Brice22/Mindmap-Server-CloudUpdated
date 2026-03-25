'use client';
 
import React, { useState, useRef, useEffect } from 'react';
import type { Node, FilterOptions, SortField } from '@/lib/types';
 
const API_URL = process.env.NEXT_PUBLIC_API_URL || '';
 
interface UnifiedSearchBarProps {
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  nodeTypes: string[];
  allNodes: Node[];
  onSelectNode: (node: Node) => void;
}
 
export default function UnifiedSearchBar({
  filters,
  onFilterChange,
  nodeTypes,
  allNodes,
  onSelectNode,
}: UnifiedSearchBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState<Node[]>([]);
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
 
  // Search logic — MeiliSearch with local fallback
  useEffect(() => {
    if (!searchQuery.trim()) {
      setResults([]);
      setShowResults(false);
      return;
    }
 
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`${API_URL}/api/mindmap/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data || []);
          setShowResults(true);
          return;
        }
      } catch { /* MeiliSearch unavailable */ }
 
      // Local fallback
      const lower = searchQuery.toLowerCase();
      setResults(
        allNodes.filter(n =>
          n.name.toLowerCase().includes(lower) ||
          n.description?.toLowerCase().includes(lower)
        ).slice(0, 15)
      );
      setShowResults(true);
    }, 200);
 
    return () => clearTimeout(timer);
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
          placeholder="Search nodes... (Ctrl+K)"
          style={{
            background: '#1e1e2e', color: '#ccc', border: '1px solid #444',
            padding: '6px 10px', borderRadius: '4px', fontSize: '13px',
            width: '100%', outline: 'none',
          }}
        />
        {/* Dropdown results */}
        {showResults && results.length > 0 && (
          <div style={{
            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999,
            background: '#2a2a3a', border: '1px solid #444', borderRadius: '0 0 4px 4px',
            maxHeight: '300px', overflow: 'auto',
          }}>
            {results.map(node => (
              <div key={node.id}
                onClick={() => { onSelectNode(node); setSearchQuery(''); setShowResults(false); }}
                style={{
                  padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #333', color: '#ccc',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = '#333')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{node.name}</div>
                <div style={{ fontSize: '11px', color: '#888' }}>{node.description?.slice(0, 60) || ''}</div>
              </div>
            ))}
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