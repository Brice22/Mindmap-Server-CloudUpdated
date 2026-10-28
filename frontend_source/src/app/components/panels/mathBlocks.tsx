'use client';

// ============================================================
// MATH FOR BLOCKNOTE (KaTeX)
// ============================================================
// - Math block:  /math  → a full-width equation (display mode)
//                click it to edit, Ctrl+Enter or click away to finish
//                "Show on node" puts the equation on the graph node
// - Inline math: /inline math → a formula inside a sentence
//                click it to edit
// Both are saved inside the document JSON as LaTeX text.
// ============================================================

import React, { useContext, useEffect, useRef, useState } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultInlineContentSpecs,
  insertOrUpdateBlockForSlashMenu,
} from '@blocknote/core';
import {
  createReactBlockSpec,
  createReactInlineContentSpec,
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from '@blocknote/react';
import { NodeFormulaContext } from '@/lib/NodeFormulaContext'; 
import { LAYOUT_PROPS } from './blockLayout';
import { ChartBlock, GraphBlock } from './chartBlocks';
import { EmbedBlock } from './embedBlock';
import { FlashcardBlock } from './flashcardBlock';
import { NodeMention } from './nodeMentions';
import { PlaceMention } from './placeMention';

// Render LaTeX to HTML; bad LaTeX shows in red instead of crashing
function renderLatex(latex: string, displayMode: boolean) {
  return katex.renderToString(latex, { displayMode, throwOnError: false, errorColor: '#f87171' });
}

// ------------------------------------------------------------
// MATH BLOCK (display equation)
// ------------------------------------------------------------
function MathBlockView({ block, editor }: { block: any; editor: any }) {
  const latex: string = block.props.latex || '';
  const [editing, setEditing] = useState(!latex);
  const [draft, setDraft] = useState(latex);
  const nodeCtx = useContext(NodeFormulaContext);
  const shownOnNode = !!nodeCtx && !!latex && nodeCtx.formula === latex;
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) textareaRef.current?.focus(); }, [editing]);

  const finish = () => {
    if (draft !== latex) {
      editor.updateBlock(block, { props: { latex: draft } });
      // Keep the node in sync if this equation is the one shown on it
      if (shownOnNode) nodeCtx!.setFormula(draft || null);
    }
    setEditing(false);
  };

  return (
    <div style={{ width: '100%', border: '1px solid #333', borderRadius: 6, padding: 8, background: '#16161e' }}>
      {editing ? (
        <>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={finish}
            onKeyDown={e => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); finish(); }
              if (e.key === 'Escape') { e.preventDefault(); setDraft(latex); setEditing(false); }
            }}
            placeholder="LaTeX, e.g. \int_0^1 x^2\,dx = \frac{1}{3}   (Ctrl+Enter to finish)"
            rows={Math.max(2, draft.split('\n').length)}
            style={{
              width: '100%', fontFamily: 'monospace', fontSize: 13, background: '#0f0f14',
              color: '#e5e5e5', border: '1px solid #444', borderRadius: 4, padding: 6, resize: 'vertical',
            }}
          />
          {draft && (
            <div style={{ marginTop: 6, color: '#e5e5e5' }}
                 dangerouslySetInnerHTML={{ __html: renderLatex(draft, true) }} />
          )}
        </>
      ) : (
        <div
          onMouseDown={e => { e.preventDefault(); setDraft(latex); setEditing(true); }}
          title="Click to edit"
          style={{ cursor: 'text', color: '#e5e5e5', minHeight: 24 }}
          dangerouslySetInnerHTML={{ __html: latex ? renderLatex(latex, true) : '<span style="color:#666">Empty equation — click to edit</span>' }}
        />
      )}
      {nodeCtx && latex && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => nodeCtx.setFormula(shownOnNode ? null : latex)}
            style={{
              fontSize: 11, padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
              background: shownOnNode ? '#0070f3' : '#333', color: '#fff',
            }}
          >
            {shownOnNode ? '✓ Shown on node' : 'Show on node'}
          </button>
        </div>
      )}
    </div>
  );
}

const MathBlock = createReactBlockSpec(
  {
    type: 'math',
    propSchema: { latex: { default: '' }, ...LAYOUT_PROPS },
    content: 'none',
  },
  {
    render: (props) => <MathBlockView block={props.block} editor={props.editor} />,
  },
);

// ------------------------------------------------------------
// INLINE MATH (formula inside a sentence)
// ------------------------------------------------------------
function InlineMathView({ latex, onChange, editor }: { latex: string; onChange: (latex: string) => void; editor: any }) {
  const [editing, setEditing] = useState(!latex);
  const [draft, setDraft] = useState(latex);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const finish = () => {
    if (draft !== latex) onChange(draft);
    setEditing(false);
    editor.focus();   // so you can keep typing after the formula
  };

  return (
    <span style={{ position: 'relative' }}>
      <span
        onMouseDown={e => { e.preventDefault(); setDraft(latex); setEditing(true); }}
        title="Click to edit"
        style={{ cursor: 'pointer', padding: '0 2px', borderRadius: 3, background: editing ? '#0070f333' : undefined }}
        dangerouslySetInnerHTML={{ __html: latex ? renderLatex(latex, false) : '<span style="color:#666">ƒ</span>' }}
      />
      {editing && (
        <input
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={finish}
          onKeyDown={e => {
            if (e.key === 'Enter') { e.preventDefault(); finish(); }
            if (e.key === 'Escape') { e.preventDefault(); setDraft(latex); setEditing(false); }
          }}
          placeholder="LaTeX, e.g. x^2"
          style={{
            position: 'absolute', top: '100%', left: 0, zIndex: 50, minWidth: 200, marginTop: 4,
            fontFamily: 'monospace', fontSize: 13, background: '#0f0f14', color: '#e5e5e5',
            border: '1px solid #0070f3', borderRadius: 4, padding: '4px 6px',
          }}
        />
      )}
    </span>
  );
}

const InlineMath = createReactInlineContentSpec(
  {
    type: 'inlineMath',
    propSchema: { latex: { default: '' } },
    content: 'none',
  },
  {
    render: ({ inlineContent, updateInlineContent, editor }) => (
      <InlineMathView
        editor={editor}
        latex={inlineContent.props.latex}
        onChange={latex => updateInlineContent({ type: 'inlineMath', props: { latex } })}
      />
    ),
  },
);

// ------------------------------------------------------------
// SCHEMA (default blocks + math)
// ------------------------------------------------------------
export const mathSchema = BlockNoteSchema.create({
  blockSpecs: { ...defaultBlockSpecs, math: MathBlock(), chart: ChartBlock(), graph: GraphBlock(), embed: EmbedBlock(), flashcard: FlashcardBlock() },
    inlineContentSpecs: { ...defaultInlineContentSpecs, inlineMath: InlineMath, nodeMention: NodeMention, place: PlaceMention },
});

// ------------------------------------------------------------
// SLASH MENU ("/" menu) — default items + the two math items
// ------------------------------------------------------------
export function getSlashMenuItems(editor: any): DefaultReactSuggestionItem[] {
  const mathItems: DefaultReactSuggestionItem[] = [
    {
      title: 'Math block',
      subtext: 'Full-width equation (LaTeX)',
      aliases: ['math', 'equation', 'latex', 'formula', 'katex'],
      group: 'Math',
      icon: <span style={{ fontSize: 16 }}>∑</span>,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'math', props: { latex: '' } } as any),
    },
    {
      title: 'Inline math',
      subtext: 'Formula inside a sentence (LaTeX)',
      aliases: ['inline', 'inlinemath', 'latex', 'formula'],
      group: 'Math',
      icon: <span style={{ fontSize: 16 }}>ƒ</span>,
           onItemClick: () => editor.insertInlineContent([{ type: 'inlineMath', props: { latex: '' } }, ' ']),
    },
    {
      title: 'Chart',
      subtext: 'Bar, line, pie, doughnut or radar chart from a small table',
      aliases: ['chart', 'bar', 'pie', 'line', 'plot', 'data'],
      group: 'Math',
      icon: <span style={{ fontSize: 16 }}>📊</span>,
      onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'chart' } as any),
    },
    {
      title: 'Graph',
      subtext: 'Plot functions like sin(x) or x^2 (Desmos-style)',
      aliases: ['graph', 'function', 'plot', 'desmos', 'jsxgraph'],
      group: 'Math',
      icon: <span style={{ fontSize: 16 }}>📈</span>,
           onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'graph' } as any),
    },
    {
      title: 'Embed',
      subtext: 'Show a web page: Desmos/GeoGebra share link, YouTube, …',
      aliases: ['embed', 'iframe', 'link', 'youtube', 'desmos', 'geogebra', 'web'],
      group: 'Math',
      icon: <span style={{ fontSize: 16 }}>🌐</span>,
           onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'embed' } as any),
    },
    {
      title: 'Place',
      subtext: 'Search a city, address or venue — shows on Maps',
      aliases: ['place', 'location', 'map', 'address', 'city', 'pin'],
      group: 'Math',
      icon: <span style={{ fontSize: 16 }}>📍</span>,
      onItemClick: () => editor.insertInlineContent([{ type: 'place', props: { name: '', lat: 0, lng: 0 } }, ' ']),
       },
          {
        title: 'Flashcard',
        subtext: 'Question + answer → Quiz Center (or type "term :: definition", or hide words in {{double braces}})',
        aliases: ['flashcard', 'card', 'quiz', 'study', 'qa', 'question'],
        group: 'Study',
        icon: <span style={{ fontSize: 16 }}>🧠</span>,
        onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'flashcard' } as any),
      },
  ];
  // Math items first so typing /graph picks Graph, not Paragraph (which also contains "graph")
  return [...mathItems, ...getDefaultReactSlashMenuItems(editor)];
}