// ============================================================
// MEDIA TOOLS - run ffmpeg / ffprobe / tesseract / pdftoppm
// ============================================================
// These are programs, not npm packages:
//   - in Docker they are installed by backend_source/Dockerfile
//   - on the laptop they are optional; features that need a missing
//     program are skipped and picked up later once it's installed
// OCR language(s): OCR_LANGS (default "eng"; e.g. "eng+spa" needs
// the tesseract-ocr-spa package).
// ============================================================

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface RunResult { code: number; stdout: string; stderr: string }

// Run a program; kills it after timeoutMs. onStdout sees output as it arrives (for progress).
export function run(cmd: string, args: string[], opts: { timeoutMs?: number; onStdout?: (chunk: string) => void } = {}): Promise<RunResult> {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e: any) {
      return resolve({ code: -1, stdout: '', stderr: String(e?.message || e) });
    }
    const timer = opts.timeoutMs ? setTimeout(() => child.kill('SIGKILL'), opts.timeoutMs) : null;
    child.stdout?.on('data', (d: Buffer) => {
      const s = d.toString('utf8');
      if (stdout.length < 20_000_000) stdout += s;
      opts.onStdout?.(s);
    });
    child.stderr?.on('data', (d: Buffer) => { if (stderr.length < 200_000) stderr += d.toString('utf8'); });
    child.on('error', (e: any) => { if (timer) clearTimeout(timer); resolve({ code: -1, stdout, stderr: stderr + String(e?.message || e) }); });
    child.on('close', (code) => { if (timer) clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr }); });
  });
}

// Is a program installed? (checked once per start)
const toolCache = new Map<string, Promise<boolean>>();
export function hasTool(cmd: string): Promise<boolean> {
  if (!toolCache.has(cmd)) {
    const flag = cmd === 'pdftoppm' ? '-v' : '-version';
    toolCache.set(cmd, run(cmd, [cmd === 'tesseract' ? '--version' : flag], { timeoutMs: 10_000 }).then(r => r.code === 0 || /version/i.test(r.stdout + r.stderr)));
  }
  return toolCache.get(cmd)!;
}

// ------------------------------------------------------------
// OCR
// ------------------------------------------------------------
const OCR_LANGS = process.env.OCR_LANGS || 'eng';

export async function ocrImage(abs: string): Promise<string> {
  const r = await run('tesseract', [abs, 'stdout', '-l', OCR_LANGS, '--psm', '3'], { timeoutMs: 180_000 });
  if (r.code !== 0) throw new Error(`tesseract: ${r.stderr.trim().split('\n').pop() || 'failed'}`);
  return r.stdout;
}

// One PDF page → picture (200 dpi, grey) → OCR
export async function ocrPdfPage(abs: string, page: number): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'hserver-ocr-'));
  try {
    const r = await run('pdftoppm', ['-r', '200', '-gray', '-png', '-f', String(page), '-l', String(page), abs, path.join(dir, 'p')], { timeoutMs: 180_000 });
    if (r.code !== 0) throw new Error(`pdftoppm: ${r.stderr.trim().split('\n').pop() || 'failed'}`);
    const img = (await fs.promises.readdir(dir)).find(f => f.endsWith('.png'));
    return img ? await ocrImage(path.join(dir, img)) : '';   // await before the folder is removed
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

// ------------------------------------------------------------
// FFPROBE
// ------------------------------------------------------------
export interface MediaInfo {
  duration: number | null;
  format: string;
  width?: number; height?: number;
  vcodec?: string; pixfmt?: string;
  acodec?: string;
}

export async function probe(abs: string): Promise<MediaInfo> {
  const r = await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', abs], { timeoutMs: 60_000 });
  if (r.code !== 0) throw new Error(`ffprobe: ${r.stderr.trim().split('\n').pop() || 'failed'}`);
  const j = JSON.parse(r.stdout || '{}');
  const streams: any[] = j.streams || [];
  const v = streams.find(s => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const a = streams.find(s => s.codec_type === 'audio');
  return {
    duration: Number(j.format?.duration) || null,
    format: String(j.format?.format_name || ''),
    ...(v ? { width: v.width, height: v.height, vcodec: v.codec_name, pixfmt: v.pix_fmt } : {}),
    ...(a ? { acodec: a.codec_name } : {}),
  };
}