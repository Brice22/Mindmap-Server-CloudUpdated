// ============================================================
// Copy Excalidraw's fonts into public/fonts
// ============================================================
// Excalidraw downloads its handwriting fonts from esm.sh (an outside
// CDN) unless they are served by this app. This copies them from
// node_modules so they load from your own server. Runs automatically
// before `dev` and `build` (see package.json). public/fonts is in
// .gitignore because it's regenerated every time.
// ============================================================
import { cpSync, existsSync } from 'node:fs';

const from = 'node_modules/@excalidraw/excalidraw/dist/prod/fonts';
const to = 'public/fonts';

if (existsSync(from)) {
  cpSync(from, to, { recursive: true });
  console.log('Excalidraw fonts copied to public/fonts');
} else {
  console.warn('Excalidraw fonts not found in node_modules — run bun install');
}