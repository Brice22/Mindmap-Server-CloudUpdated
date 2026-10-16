'use client';

// ============================================================
// EXCALIDRAW WRAPPER - Sketches and quick notes per node
// ============================================================
// SAVING (same approach as Docs):
// - Save button saves immediately
// - Closing the panel saves first
// - Safety net: unsaved drawings are saved every 2 minutes
// Only real drawing changes count — panning/zooming/selecting
// doesn't mark the drawing as unsaved.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import '@excalidraw/excalidraw/index.css';
import '@/lib/excalidrawAssets'; // fonts from this app, not esm.sh
const SAFETY_SAVE_MS = 2 * 60 * 1000;

interface ExcalidrawWrapperProps {
  initialData?: any;
  onSave?: (data: any) => void | Promise<void>;
}

type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

// A number that changes whenever any element is added, edited or deleted
function sceneVersion(elements: readonly any[] = []): string {
  let sum = 0;
  for (const el of elements) sum += el.version || 0;
  return `${elements.length}:${sum}`;
}

// Saved data comes back from the database as plain JSON. Excalidraw expects
// appState.collaborators to be a Map, so rebuild it (this caused the crash).
function toInitialData(data: any) {
  if (!data || !Array.isArray(data.elements)) return undefined;
  const { collaborators, ...appState } = data.appState || {};
  return {
    elements: data.elements,
    appState: { ...appState, collaborators: new Map() },
    files: data.files || undefined,
  };
}

// Only keep the parts of appState worth saving
function pickAppState(state: any) {
  return {
    viewBackgroundColor: state.viewBackgroundColor,
    scrollX: state.scrollX,
    scrollY: state.scrollY,
    zoom: state.zoom,
    gridSize: state.gridSize,
  };
}

export default function ExcalidrawWrapper({ initialData, onSave }: ExcalidrawWrapperProps) {
  const [Excalidraw, setExcalidraw] = useState<any>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [startData] = useState(() => toInitialData(initialData));

  const pending = useRef<any>(null);
  const lastVersion = useRef<string>(sceneVersion(startData?.elements));
  const onSaveRef = useRef(onSave);
  useEffect(() => { onSaveRef.current = onSave; }, [onSave]);

  useEffect(() => {
    // Dynamic import — Excalidraw doesn't support server rendering
    import('@excalidraw/excalidraw')
      .then(mod => setExcalidraw(() => mod.Excalidraw))
      .catch(() => console.warn('Excalidraw failed to load. Run: bun add @excalidraw/excalidraw'));
  }, []);

  const save = useCallback(async () => {
    const data = pending.current;
    if (!data || !onSaveRef.current) return;
    pending.current = null;
    setSaveState('saving');
    try {
      await onSaveRef.current(data);
      setSaveState(pending.current ? 'unsaved' : 'saved');
    } catch {
      if (!pending.current) pending.current = data;
      setSaveState('error');
    }
  }, []);

  // Safety-net save, and save when the panel closes
  useEffect(() => {
    const timer = setInterval(save, SAFETY_SAVE_MS);
    return () => { clearInterval(timer); save(); };
  }, [save]);

  const handleChange = useCallback((elements: readonly any[], appState: any, files: any) => {
    const version = sceneVersion(elements);
    if (version === lastVersion.current) return; // pan/zoom/select only
    lastVersion.current = version;
    pending.current = { elements, appState: pickAppState(appState), files };
    setSaveState('unsaved');
  }, []);

  if (!Excalidraw) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#666', background: '#1e1e2e' }}>
        Loading Excalidraw...
      </div>
    );
  }

  const canSave = saveState === 'unsaved' || saveState === 'error';
  const statusText: Record<SaveState, string> = {
    saved: 'All changes saved', unsaved: 'Unsaved changes', saving: 'Saving…', error: 'Save failed — click Save to retry',
  };

  return (
    <div style={{ height: '100%', width: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', background: '#252526', borderBottom: '1px solid #333', flexShrink: 0 }}>
        <button onClick={save} disabled={!canSave}
          style={{
            background: canSave ? '#0070f3' : '#333', color: canSave ? '#fff' : '#777',
            border: 'none', padding: '4px 10px', borderRadius: 4, fontSize: 12,
            cursor: canSave ? 'pointer' : 'default',
          }}>
          💾 Save
        </button>
        <span style={{ fontSize: 11, color: saveState === 'error' ? '#ef4444' : saveState === 'unsaved' ? '#f59e0b' : '#666' }}>
          {statusText[saveState]}
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Excalidraw initialData={startData} theme="dark" onChange={handleChange} />
      </div>
    </div>
  );
}