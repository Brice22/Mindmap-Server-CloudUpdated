// ============================================================
// FILE TEXT SERVICE - read the text inside files
// ============================================================
// Every file in the library gets its text read once, in the
// background, one file at a time:
//   PDF                      → text of each page
//   Word (.docx) / .odt      → paragraphs
//   PowerPoint (.pptx) / .odp → text of each slide
//   Excel (.xlsx) / .ods     → cells of each sheet
//   EPUB                     → each chapter
//   text, markdown, CSV, JSON, HTML, LaTeX, subtitles, …
// The text is kept in file_texts (one row per page / slide / sheet /
// part) and then:
//   - searched by 📁 Files and the search bar (MeiliSearch)
//   - scanned for backlinks, like Docs (a PDF that mentions
//     "Chess Club" links to that node)
// OCR (tesseract): pictures, and PDF pages that are scans (no text
// layer), are read as images — handwriting and photos of notes work
// best when they're sharp. Without tesseract (e.g. on the laptop) they
// wait as "needs-ocr" and are read once it's installed.
// Saved web pages are skipped: their text is already a document.
// files.text_status: NULL = not read yet · done · empty · skipped · failed · needs-ocr
// files.ocr_at: when OCR was tried on the file
// ============================================================

import { Injectable, Inject, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { unzipSync, strFromU8 } from 'fflate';
import { parseHTML } from 'linkedom';
import { DatabaseService } from '../database/database.service';
import { BacklinksService } from './backlinks.service';
import { SearchService } from './search.service';
import { absPath } from './uploads';
import { hasTool, ocrImage, ocrPdfPage } from './media-tools';

const MAX_FILE_BYTES = 200 * 1024 * 1024;   // bigger files are not read
const MAX_CHARS = 5_000_000;                // text kept per file
const PART_CHARS = 4000;                    // long text without pages is split into parts of this size

const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'tex', 'srt', 'vtt', 'log', 'yaml', 'yml', 'xml', 'ini', 'rtf', 'py', 'js', 'ts', 'c', 'cpp', 'h', 'java', 'cs', 'm', 'r', 'sql']);
const HTML_EXT = new Set(['html', 'htm', 'xhtml']);
const ZIP_EXT = new Set(['docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'epub']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'tif', 'tiff', 'bmp', 'gif', 'pnm']);
const OCR_MAX_PDF_PAGES = 300;              // scanned pages read per PDF
const SCANNED_PAGE_CHARS = 25;              // a PDF page with less text than this is treated as a scan

type Extracted = { pages: string[]; ocr?: boolean } | null | 'needs-ocr';

// ------------------------------------------------------------
// small helpers
// ------------------------------------------------------------
function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

const tidy = (s: string) => s.replace(/[ \t ]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();

// Text of an XML part: paragraph ends become new lines, tags are dropped
function xmlText(xml: string, paragraphEnd: RegExp): string {
  return tidy(decodeXml(
    xml.replace(paragraphEnd, '\n')
       .replace(/<(w:tab|text:tab|a:tab)\b[^>]*\/>/g, '\t')
       .replace(/<(w:br|text:line-break|a:br)\b[^>]*\/>/g, '\n')
       .replace(/<[^>]+>/g, ''),
  ));
}

function splitParts(text: string): string[] {
  const parts: string[] = [];
  let rest = text;
  while (rest.length > PART_CHARS) {
    // break at a paragraph or sentence near the limit
    let cut = rest.lastIndexOf('\n', PART_CHARS);
    if (cut < PART_CHARS / 2) cut = rest.lastIndexOf('. ', PART_CHARS);
    if (cut < PART_CHARS / 2) cut = PART_CHARS;
    parts.push(rest.slice(0, cut + 1).trim());
    rest = rest.slice(cut + 1);
  }
  if (rest.trim()) parts.push(rest.trim());
  return parts;
}

const byNumber = (re: RegExp) => (a: string, b: string) => Number(re.exec(a)?.[1] || 0) - Number(re.exec(b)?.[1] || 0);

// ------------------------------------------------------------
// readers — each returns the pages / slides / sheets / parts
// ------------------------------------------------------------
async function readPdf(data: Buffer): Promise<string[]> {
  const unpdf: any = await import('unpdf');
  const pdf = await unpdf.getDocumentProxy(new Uint8Array(data));
  const { text } = await unpdf.extractText(pdf, { mergePages: false });
  return (text as string[]).map(t => tidy(String(t || '')));
}

function readZip(data: Buffer, ext: string): string[] {
  const zip = unzipSync(new Uint8Array(data));
  const file = (name: string) => (zip[name] ? strFromU8(zip[name]) : '');
  const names = Object.keys(zip);

  if (ext === 'docx') {
    const parts = ['word/document.xml', ...names.filter(n => /^word\/(footnotes|endnotes)\.xml$/.test(n))];
    return splitParts(parts.map(n => xmlText(file(n), /<\/w:p>/g)).join('\n\n'));
  }
  if (ext === 'pptx') {
    const re = /^ppt\/slides\/slide(\d+)\.xml$/;
    return names.filter(n => re.test(n)).sort(byNumber(re)).map(n => xmlText(file(n), /<\/a:p>/g));
  }
  if (ext === 'xlsx') {
    const shared = Array.from(file('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g))
      .map(m => decodeXml(m[1].replace(/<[^>]+>/g, '')));
    const re = /^xl\/worksheets\/sheet(\d+)\.xml$/;
    return names.filter(n => re.test(n)).sort(byNumber(re)).map(n => {
      const rows = Array.from(file(n).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)).map(row =>
        Array.from(row[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)).map(c => {
          const attrs = c[1] || '';
          const inner = c[2] || '';
          if (/\bt="s"/.test(attrs)) return shared[Number(/<v>([^<]*)<\/v>/.exec(inner)?.[1])] ?? '';
          if (/\bt="inlineStr"/.test(attrs)) return decodeXml(inner.replace(/<[^>]+>/g, ''));
          return decodeXml(/<v>([^<]*)<\/v>/.exec(inner)?.[1] || '');
        }).filter(Boolean).join('\t'));
      return tidy(rows.filter(Boolean).join('\n'));
    });
  }
  if (ext === 'odt' || ext === 'odp' || ext === 'ods') {
    const xml = file('content.xml');
    if (ext === 'odp') {
      return Array.from(xml.matchAll(/<draw:page\b[\s\S]*?<\/draw:page>/g)).map(m => xmlText(m[0], /<\/text:(p|h)>/g));
    }
    if (ext === 'ods') {
      return Array.from(xml.matchAll(/<table:table\b[\s\S]*?<\/table:table>/g))
        .map(m => xmlText(m[0].replace(/<\/table:table-cell>/g, '\t'), /<\/table:table-row>/g));
    }
    return splitParts(xmlText(xml, /<\/text:(p|h)>/g));
  }
  if (ext === 'epub') {
    const chapters = names.filter(n => /\.(x?html?)$/i.test(n)).sort();
    return chapters.map(n => tidy(parseHTML(file(n)).document.body?.textContent || ''));
  }
  return [];
}

@Injectable()
export class FileTextService {
  private readonly logger = new Logger(FileTextService.name);
  private running: Promise<void> | null = null;
  private again = false;

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(BacklinksService) private readonly backlinks: BacklinksService,
    @Inject(SearchService) private readonly search: SearchService,
  ) {
    // Files added before this feature (or while the server was off) get read too,
    // and files restored from the Trash are picked up within a minute
    setTimeout(() => this.prepareOcr().finally(() => this.kick()), 20_000);
    setInterval(() => this.kick(), 60_000);
  }

  // Once OCR is available, pictures and scanned PDFs that were never OCR'd get read again
  private async prepareOcr() {
    if (!(await hasTool('tesseract'))) { this.logger.warn('tesseract not installed — pictures and scanned PDFs wait for OCR'); return; }
    const res = await this.db.query(
      `UPDATE files SET text_status = NULL
       WHERE ocr_at IS NULL AND text_status IN ('needs-ocr', 'skipped', 'empty')
         AND (mime LIKE 'image/%' OR mime = 'application/pdf' OR lower(name) ~ '\\.(png|jpe?g|webp|tiff?|bmp|gif|pdf)$')`,
    ).catch(() => ({ rowCount: 0 }));
    if (res.rowCount) this.logger.log(`OCR: ${res.rowCount} picture(s)/scanned PDF(s) queued`);
  }

  // Read any files that haven't been read yet (runs in the background, one file at a time)
  kick() {
    if (this.running) { this.again = true; return; }
    this.running = (async () => {
      do {
        this.again = false;
        for (;;) {
          const res = await this.db.query(`SELECT id FROM files WHERE text_status IS NULL ORDER BY id LIMIT 10`).catch(() => ({ rows: [] }));
          if (!res.rows.length) break;
          for (const r of res.rows) await this.readFile(r.id);
        }
      } while (this.again);
    })().catch(e => this.logger.warn('File reading stopped: ' + (e?.message || e))).finally(() => { this.running = null; });
  }

  // Read one file now (also used by "Read again")
  async readFile(fileId: number) {
    const file = (await this.db.query('SELECT id, path, name, mime, size FROM files WHERE id = $1', [fileId])).rows[0];
    if (!file) return;
    let status = 'done';
    let pages: string[] = [];
    let usedOcr = false;
    try {
      if (file.path.startsWith('web/') || file.path.startsWith('derived/')) status = 'skipped';   // saved page / converted copy
      else {
        const got = await this.extract(file.path, file.name, file.mime);
        if (got === null) status = 'skipped';                           // a kind of file we can't read (yet)
        else if (got === 'needs-ocr') status = 'needs-ocr';             // picture/scan, tesseract not installed
        else { pages = got.pages; usedOcr = !!got.ocr; }
      }
    } catch (e: any) {
      status = 'failed';
      this.logger.warn(`Could not read "${file.name}": ${e?.message || e}`);
    }
    pages = (pages || []).map(p => p.replace(/\u0000/g, ''));
    // keep at most MAX_CHARS in total
    let budget = MAX_CHARS;
    pages = pages.map(p => { const t = p.slice(0, Math.max(0, budget)); budget -= t.length; return t; });
    if (status === 'done' && !pages.some(p => p.trim())) status = 'empty';

    await this.db.query('DELETE FROM file_texts WHERE file_id = $1', [fileId]);
    for (let i = 0; i < pages.length; i++) {
      if (!pages[i].trim()) continue;
      await this.db.query('INSERT INTO file_texts (file_id, page, text) VALUES ($1, $2, $3)', [fileId, i + 1, pages[i]]);
    }
    await this.db.query(
      `UPDATE files SET text_status = $2, text_pages = $3, ocr_at = CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE ocr_at END WHERE id = $1`,
      [fileId, status, pages.length || null, usedOcr],
    );
    if (status === 'done') this.logger.log(`Read "${file.name}": ${pages.length} page(s)${usedOcr ? ' (OCR)' : ''}`);

    // Backlinks (in the backlinks job queue) and search
    this.backlinks.enqueue(() => this.backlinks.reindexFile(fileId));
    await this.search.indexFile(fileId);
  }

  // A file left the library: drop its backlinks and search entries (its text rows go with the row)
  forget(fileId: number) {
    this.backlinks.enqueue(() => this.backlinks.removeFile(fileId));
    this.search.removeFile(fileId).catch(() => {});
  }

  // null = a kind of file we can't read · 'needs-ocr' = a picture/scan and no tesseract yet
  private async extract(rel: string, name: string, mime: string | null): Promise<Extracted> {
    const ext = path.extname(name || rel).slice(1).toLowerCase() || path.extname(rel).slice(1).toLowerCase();
    const type = String(mime || '').toLowerCase();
    const isPdf = ext === 'pdf' || type === 'application/pdf';
    const isZip = ZIP_EXT.has(ext);
    const isHtml = HTML_EXT.has(ext) || type === 'text/html';
    const isText = TEXT_EXT.has(ext) || type.startsWith('text/') || type === 'application/json';
    const isImage = IMAGE_EXT.has(ext) || (type.startsWith('image/') && type !== 'image/svg+xml');
    if (!isPdf && !isZip && !isHtml && !isText && !isImage) return null;

    const abs = absPath(rel);
    const st = await fs.promises.stat(abs);
    if (st.size > MAX_FILE_BYTES) return null;

    // Pictures: OCR
    if (isImage) {
      if (!(await hasTool('tesseract'))) return 'needs-ocr';
      return { pages: [tidy(await ocrImage(abs))], ocr: true };
    }

    const data = await fs.promises.readFile(abs);
    if (isPdf) {
      const pages = await readPdf(data);
      // Pages without a text layer are scans → OCR them
      const scanned = pages.map((p, i) => (p.replace(/\s/g, '').length < SCANNED_PAGE_CHARS ? i : -1)).filter(i => i >= 0);
      if (!scanned.length) return { pages };
      if (!(await hasTool('tesseract')) || !(await hasTool('pdftoppm'))) {
        return scanned.length === pages.length ? 'needs-ocr' : { pages };
      }
      for (const i of scanned.slice(0, OCR_MAX_PDF_PAGES)) {
        try { pages[i] = tidy(await ocrPdfPage(abs, i + 1)); } catch (e: any) { this.logger.warn(`OCR page ${i + 1}: ${e?.message}`); }
      }
      return { pages, ocr: true };
    }
    if (isZip) return { pages: readZip(data, ext) };
    const text = data.toString('utf8');
    if (isHtml) return { pages: splitParts(tidy(parseHTML(text).document.body?.textContent || '')) };
    if (ext === 'rtf') return { pages: splitParts(tidy(text.replace(/\\par[d]?/g, '\n').replace(/\{\\[^{}]*\}|\\[a-z]+-?\d* ?|[{}]/gi, ''))) };
    return { pages: splitParts(text) };
  }
}