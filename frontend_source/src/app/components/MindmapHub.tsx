'use client';

import React, { useState } from 'react';
import type { Node, MindmapCollection } from '@/lib/types';

// Default collection templates
const DEFAULT_TEMPLATES = [
  { name: 'Family Tree', icon: '🌳', description: 'Family relationships and history' },
  { name: 'Goals', icon: '🎯', description: 'Long-term objectives and milestones' },
  { name: 'Daily Journal', icon: '📓', description: 'New Etherpad entry each day' },
  { name: 'Dream Journal', icon: '🌙', description: 'Record and track your dreams' },
  { name: 'Health & Nutrition', icon: '🏥', description: 'Health analytics and nutrition diary' },
  { name: 'Lesson Plans', icon: '📚', description: 'Design curriculum, courses, and study materials' },
  { name: 'Study Deck', icon: '🧪', description: 'Nodes flagged for quizzing and spaced repetition' },
];

interface MindmapHubProps {
  collections: MindmapCollection[];
  onCreateCollection: (collection: MindmapCollection) => void;
  onOpenCollection: (collection: MindmapCollection) => void;
  onDeleteCollection: (id: string) => void;
  nodes: Node[];
}

export default function MindmapHub({
  collections,
  onCreateCollection,
  onOpenCollection,
  onDeleteCollection,
  nodes,
}: MindmapHubProps) {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIcon, setNewIcon] = useState('📋');
  const [newDesc, setNewDesc] = useState('');
  const [selectedNodeIds, setSelectedNodeIds] = useState<number[]>([]);
  const [nodeSearch, setNodeSearch] = useState('');

  const handleCreate = () => {
    if (!newName.trim()) return;
    onCreateCollection({
      id: `mc-${Date.now()}`,
      name: newName.trim(),
      icon: newIcon,
      description: newDesc,
      nodeIds: selectedNodeIds,
      createdAt: new Date().toISOString(),
    });
    setNewName('');
    setNewIcon('📋');
    setNewDesc('');
    setSelectedNodeIds([]);
    setShowCreateModal(false);
  };

  const handleTemplateCreate = (template: typeof DEFAULT_TEMPLATES[0]) => {
    onCreateCollection({
      id: `mc-${Date.now()}`,
      name: template.name,
      icon: template.icon,
      description: template.description,
      nodeIds: [],
      createdAt: new Date().toISOString(),
    });
  };

  const filteredNodes = nodeSearch
    ? nodes.filter(n => n.name.toLowerCase().includes(nodeSearch.toLowerCase())).slice(0, 20)
    : nodes.slice(0, 20);

  return (
    <div style={{ padding: '24px', height: '100%', overflow: 'auto', background: '#1e1e2e' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ color: '#fff', margin: 0 }}>Mindmap Collections</h2>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            background: '#0070f3', border: 'none', color: '#fff',
            padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontSize: '14px',
          }}
        >
          + New Collection
        </button>
      </div>

      {/* Existing Collections */}
      {collections.length > 0 && (
        <div style={{ marginBottom: '32px' }}>
          <h3 style={{ color: '#aaa', fontSize: '13px', textTransform: 'uppercase', marginBottom: '12px' }}>
            Your Collections
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
            {collections.map(col => (
              <div key={col.id}
                onClick={() => onOpenCollection(col)}
                style={{
                  background: '#2a2a3a', padding: '16px', borderRadius: '8px',
                  cursor: 'pointer', border: '1px solid #444', position: 'relative',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = '#0070f3')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = '#444')}
              >
                <div style={{ fontSize: '28px', marginBottom: '8px' }}>{col.icon}</div>
                <div style={{ color: '#fff', fontWeight: 'bold', marginBottom: '4px' }}>{col.name}</div>
                <div style={{ color: '#888', fontSize: '12px' }}>{col.nodeIds.length} nodes</div>
                <div style={{ color: '#666', fontSize: '11px', marginTop: '4px' }}>
                  {col.description || ''}
                </div>
                {col.mapOverlay && (
                  <div style={{ color: '#0070f3', fontSize: '11px', marginTop: '4px' }}>
                    🗺️ Map overlay
                  </div>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onDeleteCollection(col.id); }}
                  style={{
                    position: 'absolute', top: '8px', right: '8px',
                    background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '14px',
                  }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Start Templates */}
      <h3 style={{ color: '#aaa', fontSize: '13px', textTransform: 'uppercase', marginBottom: '12px' }}>
        Quick Start Templates
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
        {DEFAULT_TEMPLATES
          .filter(t => !collections.some(c => c.name === t.name))
          .map(template => (
            <div key={template.name}
              onClick={() => handleTemplateCreate(template)}
              style={{
                background: '#222233', padding: '16px', borderRadius: '8px',
                cursor: 'pointer', border: '1px dashed #555', textAlign: 'center',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#0070f3')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = '#555')}
            >
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>{template.icon}</div>
              <div style={{ color: '#ccc', fontWeight: 'bold', marginBottom: '4px' }}>{template.name}</div>
              <div style={{ color: '#666', fontSize: '12px' }}>{template.description}</div>
            </div>
          ))}
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999,
        }} onClick={() => setShowCreateModal(false)}>
          <div style={{
            background: '#2a2a3a', borderRadius: '8px', padding: '24px', width: '450px',
            border: '1px solid #444', maxHeight: '80vh', overflow: 'auto',
          }} onClick={e => e.stopPropagation()}>
            <h3 style={{ color: '#fff', marginTop: 0 }}>New Mindmap Collection</h3>

            {/* Name */}
            <label style={{ color: '#aaa', fontSize: '12px' }}>Name</label>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Career Goals"
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '12px', marginTop: '4px' }}
            />

            {/* Icon */}
            <label style={{ color: '#aaa', fontSize: '12px' }}>Icon</label>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', marginTop: '4px', flexWrap: 'wrap' }}>
              {['📋', '🌳', '🎯', '📓', '🌙', '🏥', '💼', '📚', '🧪', '🗺️', '💡', '🔬'].map(icon => (
                <button key={icon} onClick={() => setNewIcon(icon)}
                  style={{
                    background: newIcon === icon ? '#0070f3' : '#333',
                    border: 'none', fontSize: '20px', padding: '6px', borderRadius: '4px', cursor: 'pointer',
                  }}
                >{icon}</button>
              ))}
            </div>

            {/* Description */}
            <label style={{ color: '#aaa', fontSize: '12px' }}>Description (optional)</label>
            <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What is this collection for?"
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '12px', marginTop: '4px' }}
            />

            {/* Select Nodes */}
            <label style={{ color: '#aaa', fontSize: '12px' }}>Add Nodes (optional — you can add later)</label>
            <input value={nodeSearch} onChange={e => setNodeSearch(e.target.value)} placeholder="Search nodes..."
              style={{ width: '100%', background: '#1e1e2e', color: '#fff', border: '1px solid #444', padding: '8px', borderRadius: '4px', marginBottom: '8px', marginTop: '4px' }}
            />
            <div style={{ maxHeight: '150px', overflow: 'auto', marginBottom: '16px' }}>
              {filteredNodes.map(n => (
                <label key={n.id} style={{ display: 'flex', gap: '8px', padding: '4px', color: '#ccc', fontSize: '13px', cursor: 'pointer', alignItems: 'center' }}>
                  <input type="checkbox"
                    checked={selectedNodeIds.includes(n.id)}
                    onChange={() => {
                      setSelectedNodeIds(prev =>
                        prev.includes(n.id) ? prev.filter(id => id !== n.id) : [...prev, n.id]
                      );
                    }}
                  />
                  {n.name}
                </label>
              ))}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowCreateModal(false)}
                style={{ background: '#333', border: 'none', color: '#ccc', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={handleCreate}
                style={{ background: '#0070f3', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
