// ============================================================
// UPLOADS FOLDER helpers (cloud_data)
// ============================================================
// Everything saved lands under one folder, served at /uploads/:
//   - in Docker it is /app/uploads = /srv/hserverdir-data/cloud_data
//   - on the laptop it is backend_source/uploads
// Layout:
//   files/2026-10/<random>-<name>   files you upload or save from a link
//   web/2026-10/<title>-<random>/   saved web pages (article.html, page.html, images)
//   .trash/                         deleted files, kept 30 days
// Paths stored in the database are relative to this folder.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';

export const UPLOAD_ROOT = path.resolve(process.env.UPLOADS_DIR || 'uploads');
export const TRASH_DIR = '.trash';

// "files/2026-10" or "web/2026-10"
export function monthFolder(kind: 'files' | 'web'): string {
  const d = new Date();
  return `${kind}/${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function randomId(bytes = 3): string {
  return randomBytes(bytes).toString('hex');
}

// A file name that is safe on disk and in URLs (keeps letters of any language)
export function safeName(name: string, fallback = 'file'): string {
  const ext = path.extname(name).slice(0, 12);
  const base = path.basename(name, ext)
    .normalize('NFC')
    .replace(/[^\p{L}\p{N}._-]+/gu, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
    .slice(0, 80);
  const cleanExt = ext.replace(/[^\p{L}\p{N}.]+/gu, '').toLowerCase();
  return (base || fallback) + cleanExt;
}

// Absolute path on disk for a stored relative path; refuses anything outside the uploads folder
export function absPath(rel: string): string {
  const abs = path.resolve(UPLOAD_ROOT, rel);
  if (abs !== UPLOAD_ROOT && !abs.startsWith(UPLOAD_ROOT + path.sep)) throw new Error('Path outside uploads folder');
  return abs;
}

export function relPath(abs: string): string {
  return path.relative(UPLOAD_ROOT, abs).split(path.sep).join('/');
}

export async function ensureDir(rel: string): Promise<string> {
  const abs = absPath(rel);
  await fs.promises.mkdir(abs, { recursive: true });
  return abs;
}

// Move a file or folder (inside the uploads folder); adds a number if the target is taken
export async function movePath(fromRel: string, toRel: string): Promise<string> {
  let target = toRel;
  for (let i = 2; fs.existsSync(absPath(target)); i++) {
    const ext = path.posix.extname(toRel);
    target = `${toRel.slice(0, toRel.length - ext.length)}-${i}${ext}`;
  }
  await fs.promises.mkdir(path.dirname(absPath(target)), { recursive: true });
  await fs.promises.rename(absPath(fromRel), absPath(target));
  return target;
}

export async function removePath(rel: string): Promise<void> {
  try { await fs.promises.rm(absPath(rel), { recursive: true, force: true }); } catch {}
}

// Content type from a file name (for files found on disk)
const MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif',
  svg: 'image/svg+xml', bmp: 'image/bmp', heic: 'image/heic', tif: 'image/tiff', tiff: 'image/tiff', ico: 'image/x-icon',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime', avi: 'video/x-msvideo', wmv: 'video/x-ms-wmv',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/opus',
  pdf: 'application/pdf', epub: 'application/epub+zip', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv', json: 'application/json',
  html: 'text/html', htm: 'text/html', xml: 'application/xml',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text', zip: 'application/zip', '7z': 'application/x-7z-compressed', rar: 'application/vnd.rar',
  tar: 'application/x-tar', gz: 'application/gzip', torrent: 'application/x-bittorrent', stl: 'model/stl', obj: 'model/obj',
};

export function mimeFromName(name: string): string {
  return MIME[path.extname(name).slice(1).toLowerCase()] || 'application/octet-stream';
}

// File extension for a content type (for downloads that have no usable name)
export function extFromMime(mime: string): string {
  const m = mime.split(';')[0].trim().toLowerCase();
  if (m === 'image/jpeg') return '.jpg';
  if (m === 'image/svg+xml') return '.svg';
  if (m === 'text/plain') return '.txt';
  if (m === 'text/html') return '.html';
  const hit = Object.entries(MIME).find(([, v]) => v === m);
  return hit ? `.${hit[0]}` : '';
}