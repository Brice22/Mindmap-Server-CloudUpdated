// Tell Excalidraw to load its fonts from this app (/fonts/...) instead of esm.sh.
// The files are copied there by scripts/copy-excalidraw-fonts.mjs.
// Import this before importing '@excalidraw/excalidraw'.
if (typeof window !== 'undefined') {
  (window as any).EXCALIDRAW_ASSET_PATH = '/';
}
export {};