'use client';

import React, { useEffect, useState } from 'react';

// Excalidraw must be loaded client-side only (no SSR)
// Install: bun add @excalidraw/excalidraw

interface ExcalidrawWrapperProps {
  initialData?: any;
  onSave?: (data: any) => void;
}

export default function ExcalidrawWrapper({ initialData, onSave }: ExcalidrawWrapperProps) {
  const [Excalidraw, setExcalidraw] = useState<any>(null);

  useEffect(() => {
    // Dynamic import — Excalidraw doesn't support SSR
    import('@excalidraw/excalidraw').then(mod => {
      setExcalidraw(() => mod.Excalidraw);
    }).catch(() => {
      console.warn('Excalidraw not installed. Run: bun add @excalidraw/excalidraw');
    });
  }, []);

  if (!Excalidraw) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '100%', color: '#666', background: '#1e1e2e',
      }}>
        Loading Excalidraw... (run `bun add @excalidraw/excalidraw` if not installed)
      </div>
    );
  }

  return (
    <div style={{ height: '100%', width: '100%' }}>
      <Excalidraw
        initialData={initialData}
        theme="dark"
        onChange={(elements: any, state: any) => {
          // Auto-save on change (debounce in production)
          if (onSave) {
            onSave({ elements, appState: state });
          }
        }}
      />
    </div>
  );
}