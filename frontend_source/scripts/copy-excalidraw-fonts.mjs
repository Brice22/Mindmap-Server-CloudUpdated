// ============================================================
// Copy Excalidraw's fonts into public/fonts
// ============================================================
// Excalidraw downloads its handwriting fonts from esm.sh (an outside
// CDN) unless they are served by this app. This copies them from
// node_modules so they load from your own server. Runs automatically
// before `dev` and `build` (see package.json). public/fonts is in
// .gitignore because it's regenerated.
//
// Only copies files that are missing or changed, and NEVER stops
// dev/build: on Windows a running dev server (or antivirus) can lock
// the font files, which made the old one-shot copy fail with exit
// code 5 (access denied).
// ============================================================
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const from = 'node_modules/@excalidraw/excalidraw/dist/prod/fonts';
const to = 'public/fonts';

let copied = 0;
let skipped = 0;
let failed = 0;

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
      continue;
    }
    try {
      // Already there with the same size → leave it alone
      if (existsSync(d) && statSync(d).size === statSync(s).size) { skipped++; continue; }
      copyFileSync(s, d);
      copied++;
    } catch {
      failed++;
    }
  }
}

try {
  if (!existsSync(from)) {
    console.warn('Excalidraw fonts not found in node_modules — run bun install');
  } else {
    copyDir(from, to);
    console.log(`Excalidraw fonts: ${copied} copied, ${skipped} already there${failed ? `, ${failed} locked/failed (fine if they were already copied)` : ''}`);
  }
} catch (e) {
  console.warn('Could not copy Excalidraw fonts (continuing):', e?.message || e);
}
process.exit(0);