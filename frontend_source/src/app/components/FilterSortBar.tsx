'use client';

import React from 'react';
import type { FilterOptions, SortField, SortDirection } from '@/lib/types';

interface FilterSortBarProps {
  filters: FilterOptions;
  onFilterChange: (filters: FilterOptions) => void;
  nodeTypes: string[];   // Available types from your data
}

export default function FilterSortBar({ filters, onFilterChange, nodeTypes }: FilterSortBarProps) {
  return (
    <div style={{
      display: 'flex', gap: '8px', padding: '8px 12px',
      background: '#252530', borderBottom: '1px solid #333',
      alignItems: 'center', flexWrap: 'wrap',
    }}>
      {/* Filter by Type */}
      <select
        value={filters.type || 'all'}
        onChange={e => onFilterChange({ ...filters, type: e.target.value === 'all' ? undefined : e.target.value })}
        style={{
          background: '#333', color: '#ccc', border: '1px solid #444',
          padding: '4px 8px', borderRadius: '4px', fontSize: '12px',
        }}
      >
        <option value="all">All Types</option>
        {nodeTypes.map(t => (
          <option key={t} value={t}>{t}</option>
        ))}
      </select>

      {/* Sort By */}
      <select
        value={filters.sortBy || 'name'}
        onChange={e => onFilterChange({ ...filters, sortBy: e.target.value as SortField })}
        style={{
          background: '#333', color: '#ccc', border: '1px solid #444',
          padding: '4px 8px', borderRadius: '4px', fontSize: '12px',
        }}
      >
        <option value="name">Sort: Name</option>
        <option value="created_at">Sort: Date</option>
        <option value="type">Sort: Type</option>
      </select>

      {/* Sort Direction */}
      <button
        onClick={() => onFilterChange({
          ...filters,
          sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc'
        })}
        style={{
          background: '#333', color: '#ccc', border: '1px solid #444',
          padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px',
        }}
      >
        {filters.sortDir === 'asc' ? '↑ Asc' : '↓ Desc'}
      </button>

      {/* Bookmarked Only */}
      <label style={{ color: '#888', fontSize: '12px', display: 'flex', gap: '4px', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={filters.bookmarkedOnly || false}
          onChange={e => onFilterChange({ ...filters, bookmarkedOnly: e.target.checked })}
        />
        Bookmarked
      </label>
    </div>
  );
}