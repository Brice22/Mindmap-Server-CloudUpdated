'use client';

// ============================================================
// MathText — plain text with $inline$ and $$display$$ LaTeX
// ============================================================
// Used by flashcards (in Docs and in Quiz Center), so a card like
// "Derivative of $x^2$ :: $2x$" shows real math.
// ============================================================

import React from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import 'katex/contrib/mhchem';   // chemistry: $\ce{H2O}$, $\ce{2H2 + O2 -> 2H2O}$

const PATTERN = /(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g;

export default function MathText({ text, style }: { text: string; style?: React.CSSProperties }) {
  const parts = String(text || '').split(PATTERN);
  return (
    <span style={{ whiteSpace: 'pre-wrap', ...style }}>
      {parts.map((part, i) => {
        const display = part.startsWith('$$') && part.endsWith('$$') && part.length > 4;
        const inline = !display && part.startsWith('$') && part.endsWith('$') && part.length > 2;
        if (!display && !inline) return <React.Fragment key={i}>{part}</React.Fragment>;
        const latex = display ? part.slice(2, -2) : part.slice(1, -1);
        const html = katex.renderToString(latex, { displayMode: display, throwOnError: false, errorColor: '#f87171' });
        return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
      })}
    </span>
  );
}