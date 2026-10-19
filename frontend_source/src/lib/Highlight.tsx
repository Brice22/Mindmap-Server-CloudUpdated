'use client';

// Shows search text with the matched words highlighted.
// The backend marks matches as \u0001word\u0002 (plain text, so nothing can inject HTML).
import React from 'react';

export default function Highlight({ text, style }: { text: string; style?: React.CSSProperties }) {
  const parts = String(text || '').split(/(\u0001[^\u0002]*\u0002)/g);
  return (
    <span style={style}>
      {parts.map((p, i) => p.startsWith('\u0001')
        ? <mark key={i} style={{ background: '#facc1555', color: 'inherit', borderRadius: 2, padding: '0 1px' }}>{p.slice(1, -1)}</mark>
        : <React.Fragment key={i}>{p}</React.Fragment>)}
    </span>
  );
}