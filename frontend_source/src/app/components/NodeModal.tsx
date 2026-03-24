// ============================================================
// NODE MODAL - Create/Edit Node Dialog
// ============================================================
// PURPOSE: Modal dialog for various node operations.
//
// MODES:
// 1. 'create' - Create a new node with template selection
// 2. 'setParent' - Search and select a parent node
// 3. 'editLinkText' - Edit the relationship label
//
// FEATURES:
// - Template picker (Person, Medical, Concept, etc.)
// - Searchable parent dropdown
// - Form validation
// ============================================================

'use client';

import React, { useState, useMemo } from 'react';
import type { Node } from '@/lib/types';

// ============================================================
// PROPS INTERFACE
// ============================================================
interface NodeModalProps {
  mode: 'create' | 'setParent' | 'editLinkText';
  node?: Node;                    // The node being edited (for setParent/editLinkText)
  allNodes: Node[];               // All nodes (for parent search)
  onClose: () => void;
  onSubmit: (data: any) => void;
}

// ============================================================
// TEMPLATES
// ============================================================
const TEMPLATES = [
  {
    type: 'person',
    icon: '👤',
    title: 'Person',
    description: 'Bio, Relationships, History',
    defaultDesc: '## Bio\n\n## Relationships\n\n## History\n',
  },
  {
    type: 'medical',
    icon: '🏥',
    title: 'Medical Model',
    description: 'Anatomy, Symptoms, Treatment',
    defaultDesc: '## Symptoms\n\n## Diagnosis\n\n## Treatment\n',
  },
  {
    type: 'concept',
    icon: '💡',
    title: 'Concept',
    description: 'Ideas, Notes, References',
    defaultDesc: '## Overview\n\n## Key Points\n\n## References\n',
  },
  {
    type: 'location',
    icon: '📍',
    title: 'Location',
    description: 'Places, Coordinates, Details',
    defaultDesc: '## Description\n\n## History\n\n## Notable Features\n',
  },
  {
    type: 'default',
    icon: '📝',
    title: 'Generic Note',
    description: 'Blank canvas',
    defaultDesc: '',
  },
];

// ============================================================
// COMPONENT
// ============================================================
export default function NodeModal({
  mode,
  node,
  allNodes,
  onClose,
  onSubmit,
}: NodeModalProps) {
  // --------------------------------------------------------
  // STATE
  // --------------------------------------------------------
  const [name, setName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [parentSearch, setParentSearch] = useState('');
  const [selectedParent, setSelectedParent] = useState<Node | null>(null);
  const [linkText, setLinkText] = useState(
    node?.metadata && typeof node.metadata === 'object' 
      ? (node.metadata as any).linkText || ''
      : ''
  );

  // --------------------------------------------------------
  // FILTERED NODES FOR PARENT SEARCH
  // --------------------------------------------------------
  const filteredNodes = useMemo(() => {
    if (!parentSearch) return allNodes.slice(0, 10);
    
    const search = parentSearch.toLowerCase();
    return allNodes
      .filter(n => n.name.toLowerCase().includes(search))
      .slice(0, 10);
  }, [allNodes, parentSearch]);

  // --------------------------------------------------------
  // HANDLE SUBMIT
  // --------------------------------------------------------
  const handleSubmit = () => {
    if (mode === 'create') {
      if (!name.trim() || !selectedTemplate) return;
      
      const template = TEMPLATES.find(t => t.type === selectedTemplate);
      onSubmit({
        name: name.trim(),
        description: template?.defaultDesc || '',
        type: selectedTemplate,
        parent: selectedParent?.name || '',
      });
    } else if (mode === 'setParent') {
      onSubmit({
        nodeId: node?.id,
        parentName: selectedParent?.name || '',
      });
    } else if (mode === 'editLinkText') {
      onSubmit({
        nodeId: node?.id,
        linkText: linkText.trim(),
      });
    }
    
    onClose();
  };

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#252526',
          borderRadius: '12px',
          padding: '24px',
          minWidth: '400px',
          maxWidth: '500px',
          maxHeight: '80vh',
          overflow: 'auto',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ======================================================== */}
        {/* CREATE MODE */}
        {/* ======================================================== */}
        {mode === 'create' && (
          <>
            <h2 style={{ color: '#fff', margin: '0 0 20px 0' }}>
              Create New Node
            </h2>

            {/* Name Input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter node name..."
                autoFocus
                style={{
                  width: '100%',
                  background: '#1e1e1e',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  padding: '12px',
                  color: '#fff',
                  fontSize: '14px',
                }}
              />
            </div>

            {/* Template Selection */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                Template
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                {TEMPLATES.map(template => (
                  <div
                    key={template.type}
                    onClick={() => setSelectedTemplate(template.type)}
                    style={{
                      background: selectedTemplate === template.type ? '#0070f3' : '#1e1e1e',
                      border: selectedTemplate === template.type ? '2px solid #0070f3' : '1px solid #444',
                      borderRadius: '8px',
                      padding: '12px',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div style={{ fontSize: '24px', marginBottom: '4px' }}>
                      {template.icon}
                    </div>
                    <div style={{ color: '#fff', fontWeight: 500, fontSize: '14px' }}>
                      {template.title}
                    </div>
                    <div style={{ color: '#888', fontSize: '11px' }}>
                      {template.description}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Optional Parent Selection */}
            <div style={{ marginBottom: '24px' }}>
              <label style={{ color: '#888', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                Parent Node (optional)
              </label>
              <input
                type="text"
                value={parentSearch}
                onChange={(e) => setParentSearch(e.target.value)}
                placeholder="Search for parent..."
                style={{
                  width: '100%',
                  background: '#1e1e1e',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  padding: '12px',
                  color: '#fff',
                  fontSize: '14px',
                  marginBottom: '8px',
                }}
              />
              {filteredNodes.length > 0 && (
                <div
                  style={{
                    background: '#1e1e1e',
                    border: '1px solid #444',
                    borderRadius: '6px',
                    maxHeight: '150px',
                    overflow: 'auto',
                  }}
                >
                  {filteredNodes.map(n => (
                    <div
                      key={n.id}
                      onClick={() => {
                        setSelectedParent(n);
                        setParentSearch(n.name);
                      }}
                      style={{
                        padding: '8px 12px',
                        cursor: 'pointer',
                        background: selectedParent?.id === n.id ? '#0070f3' : 'transparent',
                        color: '#fff',
                        borderBottom: '1px solid #333',
                      }}
                    >
                      {n.name}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ======================================================== */}
        {/* SET PARENT MODE */}
        {/* ======================================================== */}
        {mode === 'setParent' && (
          <>
            <h2 style={{ color: '#fff', margin: '0 0 20px 0' }}>
              Set Parent for "{node?.name}"
            </h2>

            <div style={{ marginBottom: '24px' }}>
              <input
                type="text"
                value={parentSearch}
                onChange={(e) => setParentSearch(e.target.value)}
                placeholder="Search for parent node..."
                autoFocus
                style={{
                  width: '100%',
                  background: '#1e1e1e',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  padding: '12px',
                  color: '#fff',
                  fontSize: '14px',
                  marginBottom: '8px',
                }}
              />
              <div
                style={{
                  background: '#1e1e1e',
                  border: '1px solid #444',
                  borderRadius: '6px',
                  maxHeight: '250px',
                  overflow: 'auto',
                }}
              >
                {filteredNodes
                  .filter(n => n.id !== node?.id)  // Can't be own parent
                  .map(n => (
                    <div
                      key={n.id}
                      onClick={() => setSelectedParent(n)}
                      style={{
                        padding: '10px 12px',
                        cursor: 'pointer',
                        background: selectedParent?.id === n.id ? '#0070f3' : 'transparent',
                        color: '#fff',
                        borderBottom: '1px solid #333',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                      }}
                    >
                      <span>{n.name}</span>
                      {selectedParent?.id === n.id && <span>✓</span>}
                    </div>
                  ))}
              </div>
            </div>
          </>
        )}

        {/* ======================================================== */}
        {/* EDIT LINK TEXT MODE */}
        {/* ======================================================== */}
        {mode === 'editLinkText' && (
          <>
            <h2 style={{ color: '#fff', margin: '0 0 20px 0' }}>
              Edit Link Text
            </h2>
            <p style={{ color: '#888', marginBottom: '16px' }}>
              Label shown on the line connecting "{node?.name}" to its parent.
            </p>
            <input
              type="text"
              value={linkText}
              onChange={(e) => setLinkText(e.target.value)}
              placeholder="e.g., is child of, relates to, etc."
              autoFocus
              style={{
                width: '100%',
                background: '#1e1e1e',
                border: '1px solid #444',
                borderRadius: '6px',
                padding: '12px',
                color: '#fff',
                fontSize: '14px',
                marginBottom: '24px',
              }}
            />
          </>
        )}

        {/* ======================================================== */}
        {/* BUTTONS */}
        {/* ======================================================== */}
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              background: '#333',
              border: 'none',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={
              (mode === 'create' && (!name.trim() || !selectedTemplate)) ||
              (mode === 'setParent' && !selectedParent)
            }
            style={{
              background: '#0070f3',
              border: 'none',
              color: '#fff',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: 'pointer',
              opacity: 
                (mode === 'create' && (!name.trim() || !selectedTemplate)) ||
                (mode === 'setParent' && !selectedParent)
                  ? 0.5 : 1,
            }}
          >
            {mode === 'create' ? 'Create' : mode === 'setParent' ? 'Set Parent' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
