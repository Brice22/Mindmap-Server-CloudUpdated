'use client';

// ============================================================
// @MENTIONS OF NODES IN DOCS
// ============================================================
// Type @ in a document → pick a node (or create a new one) → a
// mention chip is inserted. Mentions are saved by node id, so they
// keep working if the node is renamed. On save the backend turns
// them into backlinks on that node (see backend backlinks.service).
// ============================================================

import React from 'react';
import { createReactInlineContentSpec, type DefaultReactSuggestionItem } from '@blocknote/react';

export const NodeMention = createReactInlineContentSpec(
  {
    type: 'nodeMention',
    propSchema: {
      nodeId: { default: 0 },
      name: { default: '' },
    },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => (
      <span
        title="Linked node"
        style={{ color: '#60a5fa', background: '#1e3a5f66', borderRadius: 4, padding: '0 4px', whiteSpace: 'nowrap' }}
      >
        @{inlineContent.props.name}
      </span>
    ),
  },
);

// Node list cache shared by every open editor (refreshed every 30 s)
let cache: { at: number; nodes: { id: number; name: string; type?: string }[] } | null = null;

async function loadNodes(apiUrl: string) {
  if (cache && Date.now() - cache.at < 30_000) return cache.nodes;
  try {
    const res = await fetch(`${apiUrl}/api/mindmap`);
    const rows = res.ok ? await res.json() : [];
    const nodes = (Array.isArray(rows) ? rows : []).map((n: any) => {
      const meta = typeof n.metadata === 'string' ? JSON.parse(n.metadata || '{}') : n.metadata || {};
      return { id: n.id, name: n.name, type: meta.type };
    });
    cache = { at: Date.now(), nodes };
    return nodes;
  } catch {
    return cache?.nodes || [];
  }
}

// Items for the @ menu: matching nodes, plus "Create node" when nothing matches exactly
export async function getMentionItems(editor: any, apiUrl: string, query: string): Promise<DefaultReactSuggestionItem[]> {
  const q = query.trim().toLowerCase();
  const nodes = await loadNodes(apiUrl);
  const insert = (id: number, name: string) =>
    editor.insertInlineContent([{ type: 'nodeMention', props: { nodeId: id, name } }, ' ']);

  const matches = nodes
    .filter(n => !q || n.name.toLowerCase().includes(q))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(q)) - Number(a.name.toLowerCase().startsWith(q)))
    .slice(0, 10)
    .map(n => ({
      title: n.name,
      subtext: n.type || undefined,
      onItemClick: () => insert(n.id, n.name),
    }));

  if (q && !nodes.some(n => n.name.toLowerCase() === q)) {
    const name = query.trim();
    matches.push({
      title: `Create node "${name}"`,
      subtext: 'New node, linked here',
      onItemClick: async () => {
        try {
          const res = await fetch(`${apiUrl}/api/mindmap/node`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, description: '', metadata: { type: 'concept' } }),
          });
          if (!res.ok) return;
          const node = await res.json();
          cache = null;
          insert(node.id, node.name);
        } catch {}
      },
    } as any);
  }
  return matches;
}