'use client';

// ============================================================
// NOTES PREVIEW - read-only picture of a node's Excalidraw notes
// ============================================================
// Used in the Inspector (replaces the old Etherpad box).
// Renders the saved drawing as an SVG image; click it to open the
// node's workspace and edit. Nothing is loaded until a node with
// a drawing is selected.
// ============================================================

import React, { useEffect, useState } from 'react';
import '@/lib/excalidrawAssets'; // fonts from this app, not esm.sh
import { loadDrawingFiles } from '@/lib/drawingFiles';

interface NotesPreviewProps {
  data?: any;            // node metadata.excalidrawData
  onOpen: () => void;    // open the workspace to edit
  height?: number;
}

export default function NotesPreview({ data, onOpen, height = 300 }: NotesPreviewProps) {
  const [img, setImg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const elements: any[] = (data?.elements || []).filter((el: any) => !el.isDeleted);
  // Re-render only when the drawing itself changes
  const versionKey = elements.map(el => `${el.id}:${el.version}`).join(',');

  useEffect(() => {
    if (elements.length === 0) { setImg(null); return; }
    let cancelled = false;
    setFailed(false);
    import('@excalidraw/excalidraw')
      .then(async ({ exportToCanvas }) => {
        const canvas = await exportToCanvas({
          elements,
          appState: {
            exportBackground: true,
            exportWithDarkMode: true,   // match the dark editor
            exportScale: 2,             // crisp on high-resolution screens
            viewBackgroundColor: data?.appState?.viewBackgroundColor || '#ffffff',
          },
         files: (await loadDrawingFiles(data?.files)) || null,   // pictures are stored in cloud_data
          exportPadding: 12,
          maxWidthOrHeight: 1400,      // sharp in the box, never a giant image
        });
        if (!cancelled) setImg(canvas.toDataURL('image/png'));
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versionKey]);

  const boxStyle: React.CSSProperties = {
    width: '100%', height, border: '1px solid #444', borderRadius: 4,
    background: '#121212', cursor: 'pointer', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  };

  if (elements.length === 0) {
    return (
      <div onClick={onOpen} style={{ ...boxStyle, height: 80, color: '#666', fontSize: 13 }}>
        No notes yet — click to open ✏️ Draw
      </div>
    );
  }

  return (
    <div onClick={onOpen} title="Click to edit in the workspace" style={boxStyle}>
      {failed ? (
        <span style={{ color: '#666', fontSize: 13 }}>Preview unavailable — click to open</span>
      ) : img ? (
        <img src={img} alt="Drawing preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      ) : (
        <span style={{ color: '#666', fontSize: 13 }}>Loading preview…</span>
      )}
    </div>
  );
}