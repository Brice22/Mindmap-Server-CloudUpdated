// ============================================================
// DRAW (Excalidraw) PICTURES → cloud_data
// ============================================================
// Excalidraw keeps pasted pictures as huge base64 text inside the
// drawing. Saved like that, every picture would sit in the node's
// metadata and slow down loading the whole graph.
// Instead, when a drawing is saved, each new picture is uploaded to
// the file library (📎 Files of that node) and the drawing keeps only
// its /uploads/... address. When the drawing opens, the pictures are
// loaded back from those addresses.
// Old drawings with base64 pictures are converted on their next save.
// ============================================================

import { fileUrl } from './files';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const EXT: Record<string, string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/bmp': 'bmp',
};

// Only pictures still used by an image in the drawing are kept
function usedFileIds(elements: readonly any[] = []): Set<string> {
  return new Set(elements.filter(e => e?.type === 'image' && !e.isDeleted && e.fileId).map(e => e.fileId));
}

async function dataUrlToBlob(dataURL: string): Promise<Blob> {
  return (await fetch(dataURL)).blob();
}

/**
 * Before saving: upload base64 pictures, keep their addresses instead.
 * `uploaded` remembers fileId → address for this open drawing, so a picture is uploaded once.
 */
export async function storeDrawingFiles(
  data: { elements: readonly any[]; appState: any; files?: Record<string, any> },
  nodeId: number | undefined,
  uploaded: Map<string, string>,
) {
  const used = usedFileIds(data.elements);
  const files: Record<string, any> = {};
  for (const [id, file] of Object.entries(data.files || {})) {
    if (!used.has(id) || !file) continue;
    let address: string | undefined = uploaded.get(id);
    if (!address && typeof file.dataURL === 'string' && file.dataURL.startsWith('data:')) {
      const form = new FormData();
      form.append('file', await dataUrlToBlob(file.dataURL), `drawing-${id.slice(0, 12)}.${EXT[file.mimeType] || 'png'}`);
      if (nodeId) form.append('nodeId', String(nodeId));
      const res = await fetch(`${API_URL}/api/mindmap/files`, { method: 'POST', body: form });
      if (!res.ok) throw new Error(`Picture upload failed (${res.status})`);   // the save is retried
      address = fileUrl((await res.json()).path);
      uploaded.set(id, address);
    }
    files[id] = { ...file, dataURL: address || file.dataURL };
  }
  return { ...data, files };
}

/** When opening: turn saved addresses back into pictures Excalidraw can show. */
export async function loadDrawingFiles(files?: Record<string, any> | null): Promise<Record<string, any> | undefined> {
  if (!files) return undefined;
  const out: Record<string, any> = {};
  await Promise.all(Object.entries(files).map(async ([id, file]) => {
    if (!file?.dataURL) return;
    if (file.dataURL.startsWith('data:')) { out[id] = file; return; }
    try {
      const blob = await (await fetch(file.dataURL)).blob();
      const dataURL: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      out[id] = { ...file, dataURL };
    } catch {}   // missing picture: Excalidraw shows an empty frame
  }));
  return out;
}

/** fileId → saved address, for pictures that are already in cloud_data */
export function savedAddresses(files?: Record<string, any> | null): Map<string, string> {
  const map = new Map<string, string>();
  for (const [id, file] of Object.entries(files || {})) {
    if (typeof file?.dataURL === 'string' && !file.dataURL.startsWith('data:')) map.set(id, file.dataURL);
  }
  return map;
}