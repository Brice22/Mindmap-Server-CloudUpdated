'use client';

// ============================================================
// EMBED BLOCK FOR BLOCKNOTE
// ============================================================
// /embed → shows another web page inside the document: a Desmos or
// GeoGebra share link, a YouTube video, or any site that allows it.
// (Replaces the "URL" modes of the old Chart window.)
// Share links are converted to their embeddable form automatically.
// Some sites refuse to be embedded — they'll show a blank/refused box.
// ============================================================

import React, { useState } from 'react';
import { createReactBlockSpec } from '@blocknote/react';
import { LAYOUT_PROPS } from './blockLayout';

const field: React.CSSProperties = {
  fontFamily: 'monospace', fontSize: 13, background: '#0f0f14', color: '#e5e5e5',
  border: '1px solid #444', borderRadius: 4, padding: '4px 6px',
};
const smallBtn: React.CSSProperties = { fontSize: 11, padding: '2px 8px', borderRadius: 4, border: 'none', cursor: 'pointer', color: '#fff' };

// Turn a normal share link into the address that works inside a frame
export function toEmbedUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' && u.searchParams.get('v')) return `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
    if (host === 'youtu.be') return `https://www.youtube.com/embed${u.pathname}`;
    if (host === 'desmos.com' && u.pathname.startsWith('/calculator/') && !u.search.includes('embed')) return `${u.origin}${u.pathname}?embed`;
    const gg = host === 'geogebra.org' && u.pathname.match(/^\/m\/([A-Za-z0-9]+)$/);
    if (gg) return `https://www.geogebra.org/material/iframe/id/${gg[1]}`;
    return u.toString();
  } catch {
    return '';
  }
}

function EmbedBlockView({ block, editor }: { block: any; editor: any }) {
  const { url, height } = block.props as { url: string; height: number };
  const [editing, setEditing] = useState(!url);
  const [draft, setDraft] = useState({ url, height });
  const src = toEmbedUrl(url);

  const finish = () => {
    editor.updateBlock(block, { props: { url: draft.url.trim(), height: Number(draft.height) || 400 } });
    setEditing(false);
  };

  return (
    <div style={{ width: '100%', border: '1px solid #333', borderRadius: 6, padding: 8, background: '#16161e' }}>
      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input autoFocus value={draft.url} onChange={e => setDraft({ ...draft, url: e.target.value })}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); finish(); } }}
            placeholder="Paste a link (Desmos, GeoGebra, YouTube, …)" style={field} />
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#777' }}>Height</span>
            <select value={draft.height} onChange={e => setDraft({ ...draft, height: Number(e.target.value) })} style={field}>
              {[250, 400, 550, 700].map(h => <option key={h} value={h}>{h}px</option>)}
            </select>
            <span style={{ flex: 1 }} />
            {url && (
              <button onMouseDown={e => e.preventDefault()} onClick={() => { setDraft({ url, height }); setEditing(false); }}
                style={{ ...smallBtn, background: '#333' }}>Cancel</button>
            )}
            <button onMouseDown={e => e.preventDefault()} onClick={finish}
              style={{ ...smallBtn, background: '#0070f3' }}>Done</button>
          </div>
        </div>
      ) : (
        <>
          {src ? (
            <iframe
              src={src}
              title="Embedded page"
              style={{ width: '100%', height, border: 'none', borderRadius: 4, background: '#fff' }}
              sandbox="allow-scripts allow-same-origin allow-popups allow-forms allow-presentation"
              allow="fullscreen; clipboard-write; encrypted-media; picture-in-picture"
              loading="lazy"
            />
          ) : (
            <div style={{ color: '#f87171', padding: 12, fontSize: 12 }}>Not a valid http(s) link — click Edit</div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <a href={url} target="_blank" rel="noreferrer"
              style={{ fontSize: 11, color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '80%' }}>{url}</a>
            <button onMouseDown={e => e.preventDefault()} onClick={() => { setDraft({ url, height }); setEditing(true); }}
              style={{ ...smallBtn, background: '#333' }}>Edit</button>
          </div>
        </>
      )}
    </div>
  );
}

export const EmbedBlock = createReactBlockSpec(
  {
    type: 'embed',
    propSchema: {
      url: { default: '' },
      height: { default: 400 },
       ...LAYOUT_PROPS,
    },
    content: 'none',
  },
  {
    render: (props) => <EmbedBlockView block={props.block} editor={props.editor} />,
  },
);