'use client';

// ============================================================
// 🧠 FLASHCARD BLOCK ( /flashcard ) — write study cards in your notes
// ============================================================
// A question and an answer. In the doc it works like a real card:
// "Show answer" flips it. When the doc is saved the card goes into
// Quiz Center (in this node's deck) with spaced repetition.
// Quicker way while typing: a line like  "Term :: definition".
// Use $...$ for math, e.g.  d/dx $x^2$ :: $2x$
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import MathText from '@/lib/MathText';
import { LAYOUT_PROPS } from './blockLayout';

const field: React.CSSProperties = {
  width: '100%', fontSize: 14, background: '#0f0f14', color: '#e5e5e5',
  border: '1px solid #444', borderRadius: 4, padding: 6, resize: 'vertical', fontFamily: 'inherit',
};
const small: React.CSSProperties = { fontSize: 11, padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', background: '#333', color: '#ddd' };

function FlashcardView({ block, editor }: { block: any; editor: any }) {
  const { question, answer } = block.props as { question: string; answer: string };
  const [editing, setEditing] = useState(!question && !answer);
  const [draft, setDraft] = useState({ question, answer });
  const [flipped, setFlipped] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) firstRef.current?.focus(); }, [editing]);

  const finish = () => {
    if (draft.question !== question || draft.answer !== answer) {
      editor.updateBlock(block, { props: { question: draft.question.trim(), answer: draft.answer.trim() } });
    }
    setEditing(false);
    setFlipped(false);
  };

  const keys = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); finish(); }
    if (e.key === 'Escape') { e.preventDefault(); setDraft({ question, answer }); setEditing(false); }
  };

  return (
    <div ref={boxRef}
      // Leaving both boxes (not just moving from Question to Answer) finishes editing
      onBlur={e => { if (editing && !boxRef.current?.contains(e.relatedTarget as any)) finish(); }}
      style={{ width: '100%', border: '1px solid #4c1d95', borderLeft: '4px solid #8b5cf6', borderRadius: 6, padding: 10, background: '#1a1625' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 11, color: '#a78bfa', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        🧠 Flashcard
        <span style={{ flex: 1 }} />
        {!editing && (
          <button onMouseDown={e => { e.preventDefault(); setDraft({ question, answer }); setEditing(true); }} style={small}>✎ Edit</button>
        )}
      </div>
      {editing ? (
        <>
          <textarea ref={firstRef} value={draft.question} onKeyDown={keys}
            onChange={e => setDraft(d => ({ ...d, question: e.target.value }))}
            placeholder="Question (use $...$ for math)" rows={2} style={field} />
          <textarea value={draft.answer} onKeyDown={keys}
            onChange={e => setDraft(d => ({ ...d, answer: e.target.value }))}
            placeholder="Answer   (Ctrl+Enter to finish)" rows={2} style={{ ...field, marginTop: 6 }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
            <button onMouseDown={e => { e.preventDefault(); finish(); }} style={{ ...small, background: '#7c3aed', color: '#fff' }}>Done</button>
          </div>
        </>
      ) : (
        <div onMouseDown={e => { e.preventDefault(); setFlipped(f => !f); }} title={flipped ? 'Click to hide the answer' : 'Click to show the answer'}
          style={{ cursor: 'pointer' }}>
          <div style={{ color: '#f3f0ff', fontSize: 15 }}>
            {question ? <MathText text={question} /> : <span style={{ color: '#666' }}>No question yet</span>}
          </div>
          {flipped ? (
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px dashed #4c1d95', color: '#c4b5fd' }}>
              {answer ? <MathText text={answer} /> : <span style={{ color: '#666' }}>No answer yet</span>}
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 11, color: '#6d5a99' }}>Show answer ▾</div>
          )}
        </div>
      )}
    </div>
  );
}

export const FlashcardBlock = createReactBlockSpec(
  {
    type: 'flashcard',
    propSchema: {
      question: { default: '' },
      answer: { default: '' },
      ...LAYOUT_PROPS,
    },
    content: 'none',
  },
  {
    render: (props) => <FlashcardView block={props.block} editor={props.editor} />,
  },
);