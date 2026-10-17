// ============================================================
// WEB CLIP SERVICE - save web pages and files from links
// ============================================================
// Save link (Docs → 🌐 Save link, or 📁 Files):
//   - a web page → a new document with the readable text and its
//     images (copied to cloud_data), plus two saved copies:
//       article.html  the readable version, works offline
//       page.html     the whole page as it looked (styles copied in;
//                     some pictures/fonts still load from the site)
//   - anything else (PDF, video, zip, …) → downloaded into the file
//     library (📁 Files), attached to the node
// Send to HServer (bookmark button in the browser):
//   the browser sends the page exactly as you see it — so pages you
//   are logged in to work too — and it is saved the same way.
// Saved pages are documents, so they are searchable and get backlinks.
// Scripts are removed from saved copies (they are served from this
// server, so a page's scripts must never run here).
// ============================================================

import { Injectable, Inject, Logger, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';
import { DatabaseService } from '../database/database.service';
import { BacklinksService } from './backlinks.service';
import { FilesService } from './files.service';
import { htmlToBlocks } from './html-to-blocks';
import { absPath, ensureDir, extFromMime, monthFolder, randomId, safeName } from './uploads';

const USER_AGENT = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36';
const MAX_HTML_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_IMAGES = 60;
const MAX_STYLESHEETS = 15;
const MAX_FILE_BYTES = (Number(process.env.WEB_MAX_FILE_MB) || 4096) * 1024 * 1024;
const GROUP = 'Web clips';

export interface ClipOptions { nodeId?: number | null; groupName?: string; title?: string }

// ------------------------------------------------------------
// small helpers
// ------------------------------------------------------------
function checkUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(String(raw || '').trim()); } catch { throw new BadRequestException('That is not a valid link'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new BadRequestException('Only http and https links can be saved');
  return u;
}

function absolute(href: string | null | undefined, base: string): string | null {
  if (!href || /^\s*data:/i.test(href)) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.href : null;
  } catch { return null; }
}

// fetch with a timeout for the whole request (headers and body)
async function fetchTimed(url: string, ms: number, headers: Record<string, string> = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en-US,en;q=0.9', ...headers },
    });
    return { res, done: () => clearTimeout(timer), ctrl };
  } catch (e: any) {
    clearTimeout(timer);
    throw new BadRequestException(ctrl.signal.aborted ? 'The site took too long to answer' : `Could not reach the site (${e?.message || e})`);
  }
}

// Read a response body up to a limit
async function readLimited(res: Response, limit: number): Promise<Buffer> {
  const len = Number(res.headers.get('content-length') || 0);
  if (len > limit) throw new Error('too big');
  const reader = res.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) { try { await reader.cancel(); } catch {} throw new Error('too big'); }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}

// Bytes → text using the page's character set (header, then <meta charset>)
function decodeHtml(buf: Buffer, contentType: string): string {
  const head = buf.subarray(0, 4096).toString('latin1');
  const charset = (/charset=["']?([\w-]+)/i.exec(contentType)?.[1]
    || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1]
    || 'utf-8').toLowerCase();
  try { return new TextDecoder(charset).decode(buf); } catch { return new TextDecoder('utf-8').decode(buf); }
}

// File name from Content-Disposition or the link itself
function nameForDownload(res: Response, url: string, mime: string): string {
  const cd = res.headers.get('content-disposition') || '';
  const star = /filename\*\s*=\s*[^']*''([^;]+)/i.exec(cd)?.[1];
  const plainName = /filename\s*=\s*"?([^";]+)"?/i.exec(cd)?.[1];
  let name = '';
  try { name = star ? decodeURIComponent(star) : plainName || decodeURIComponent(path.posix.basename(new URL(url).pathname)); } catch {}
  if (!name || name === '/') name = 'download';
  if (!path.extname(name)) name += extFromMime(mime);
  return name;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

// The real picture behind lazy-loading tricks (data-src, srcset, …)
function bestImageSrc(img: any, base: string): string | null {
  for (const attr of ['data-src', 'data-original', 'data-lazy-src', 'data-url', 'data-hi-res-src']) {
    const v = absolute(img.getAttribute(attr), base);
    if (v) return v;
  }
  const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || img.parentNode?.querySelector?.('source[srcset]')?.getAttribute('srcset');
  if (srcset) {
    const best = srcset.split(',').map((s: string) => s.trim().split(/\s+/))
      .map(([u, d]: string[]) => ({ u, w: parseFloat(d) || 1 }))
      .sort((a: any, b: any) => b.w - a.w)[0];
    const v = absolute(best?.u, base);
    if (v) return v;
  }
  return absolute(img.getAttribute('src'), base);
}

function tinyImage(img: any): boolean {
  const w = Number(img.getAttribute('width')), h = Number(img.getAttribute('height'));
  return (w > 0 && w <= 2) || (h > 0 && h <= 2);
}

// Remove everything that could run code when the saved copy is opened
function sanitize(document: any) {
  document.querySelectorAll(
    'script, noscript, iframe, frame, frameset, object, embed, applet, base, portal, meta[http-equiv], meta[charset], ' +
    'link[rel~="preload"], link[rel~="modulepreload"], link[rel~="prefetch"], link[rel~="import"], link[rel~="manifest"]',
  ).forEach((e: any) => e.remove());
  for (const el of Array.from(document.querySelectorAll('*')) as any[]) {
    for (const a of Array.from(el.attributes || []) as any[]) {
      const n = String(a.name).toLowerCase();
      if (n.startsWith('on') || n === 'srcdoc') el.removeAttribute(a.name);
      else if (['href', 'src', 'action', 'formaction', 'xlink:href', 'data', 'poster', 'background'].includes(n)
        && /^\s*(javascript|vbscript|data:text\/html)/i.test(String(a.value))) el.removeAttribute(a.name);
    }
  }
}

// Make every link, picture and style URL in the page absolute (the saved copy lives on this server)
function absolutizeAll(document: any, pageUrl: string) {
  const fixCss = (css: string) => css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g,
    (m, q, u) => (/^(data:|#|\/uploads\/)/i.test(u) ? m : `url(${q}${absolute(u, pageUrl) || u}${q})`));
  for (const el of Array.from(document.querySelectorAll('[href], [src], [poster], [action], [srcset], [style]')) as any[]) {
    for (const attr of ['href', 'src', 'poster', 'action']) {
      const v = el.getAttribute(attr);
      if (v == null || /^(#|data:|mailto:|tel:|\/uploads\/)/i.test(v.trim())) continue;
      const abs = absolute(v, pageUrl);
      if (abs) el.setAttribute(attr, abs);
    }
    const srcset = el.getAttribute('srcset');
    if (srcset) {
      el.setAttribute('srcset', srcset.split(',').map((part: string) => {
        const [u, ...rest] = part.trim().split(/\s+/);
        return [absolute(u, pageUrl) || u, ...rest].join(' ');
      }).join(', '));
    }
    const style = el.getAttribute('style');
    if (style && style.includes('url(')) el.setAttribute('style', fixCss(style));
  }
  for (const st of Array.from(document.querySelectorAll('style')) as any[]) st.textContent = fixCss(st.textContent || '');
}

const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const uploadsUrl = (rel: string) => '/uploads/' + rel.split('/').map(encodeURIComponent).join('/');
const text = (t: string, styles: any = {}) => ({ type: 'text', text: t, styles });
const link = (href: string, t: string) => ({ type: 'link', href, content: [text(t)] });

@Injectable()
export class WebClipService {
  private readonly logger = new Logger(WebClipService.name);

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(BacklinksService) private readonly backlinks: BacklinksService,
    @Inject(FilesService) private readonly files: FilesService,
  ) {}

  // ------------------------------------------------------------
  // SAVE A LINK (the server downloads it)
  // ------------------------------------------------------------
  async saveLink(rawUrl: string, opts: ClipOptions) {
    const url = checkUrl(rawUrl).href;
    const { res, done, ctrl } = await fetchTimed(url, 30_000, {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    });
    if (!res.ok) { done(); throw new BadRequestException(`The site answered ${res.status} ${res.statusText}`.trim()); }
    const mime = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const finalUrl = res.url || url;

    if (mime === 'text/html' || mime === 'application/xhtml+xml' || (!mime && /\.html?$/i.test(finalUrl))) {
      let buf: Buffer;
      try { buf = await readLimited(res, MAX_HTML_BYTES); }
      catch { throw new BadRequestException(ctrl.signal.aborted ? 'The site took too long to answer' : 'That page is too big to save (over 15 MB)'); }
      finally { done(); }
      return this.savePage(decodeHtml(buf, res.headers.get('content-type') || ''), finalUrl, opts);
    }

    // Not a web page: keep the file itself. Long downloads get more time.
    done();
    return this.saveDownload(res, finalUrl, mime, opts);
  }

  private async saveDownload(res: Response, url: string, mime: string, opts: ClipOptions) {
    const name = nameForDownload(res, url, mime);
    const folder = monthFolder('files');
    await ensureDir(folder);
    const rel = `${folder}/${randomId()}-${safeName(name, 'download')}`;
    const len = Number(res.headers.get('content-length') || 0);
    if (len > MAX_FILE_BYTES) throw new BadRequestException(`That file is too big (limit ${Math.round(MAX_FILE_BYTES / 1048576)} MB)`);

    const reader = res.body?.getReader();
    if (!reader) throw new BadRequestException('The site sent nothing');
    const handle = await fs.promises.open(absPath(rel), 'w');
    let total = 0;
    let idle: any;
    const resetIdle = () => { clearTimeout(idle); idle = setTimeout(() => reader.cancel().catch(() => {}), 120_000); };
    try {
      resetIdle();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        resetIdle();
        total += value.length;
        if (total > MAX_FILE_BYTES) throw new BadRequestException(`That file is too big (limit ${Math.round(MAX_FILE_BYTES / 1048576)} MB)`);
        await handle.write(value);
      }
    } catch (e) {
      await handle.close();
      await fs.promises.rm(absPath(rel), { force: true });
      throw e instanceof BadRequestException ? e : new BadRequestException('The download stopped part way');
    } finally {
      clearTimeout(idle);
    }
    await handle.close();

    const file = await this.files.register({
      path: rel, name, mime: mime || undefined, size: total,
      nodeId: opts.nodeId ?? null, sourceUrl: url, kind: 'web',
    });
    this.logger.log(`Saved file from link: ${name} (${Math.round(total / 1024)} KB)`);
    return { kind: 'file' as const, file };
  }

  // ------------------------------------------------------------
  // SAVE A PAGE (HTML downloaded above, or sent by the browser button)
  // ------------------------------------------------------------
  async savePage(html: string, rawUrl: string, opts: ClipOptions) {
    const pageUrl = checkUrl(rawUrl).href;
    if (!html || html.length < 20) throw new BadRequestException('The page was empty');

    // Two copies of the page: one stays whole (page.html), Readability takes the other apart
    const { document: page } = parseHTML(html);
    const { document: forReader } = parseHTML(html);
    let article: any = null;
    try { article = new Readability(forReader as any, { charThreshold: 200 }).parse(); } catch {}

    const host = new URL(pageUrl).hostname.replace(/^www\./, '');
    const title = String(opts.title || article?.title || page.title || host).replace(/\s+/g, ' ').trim().slice(0, 200) || host;
    const folder = `${monthFolder('web')}/${safeName(title, 'page').slice(0, 60)}-${randomId()}`;
    const folderAbs = await ensureDir(folder);

    // The readable part (or the whole body if Readability found nothing)
    const { document: readable } = parseHTML(`<!DOCTYPE html><html><head></head><body>${article?.content || page.body?.innerHTML || ''}</body></html>`);

    // ---- pictures: copy the article's images into the folder ----
    const imgs = (Array.from(readable.querySelectorAll('img')) as any[]).filter(img => !tinyImage(img));
    const wanted = [...new Set(imgs.map(img => bestImageSrc(img, pageUrl)).filter(Boolean) as string[])].slice(0, MAX_IMAGES);
    const saved = new Map<string, string>();   // original URL → file name in the folder
    await mapLimit(wanted, 4, async (src, i) => {
      try {
        const { res, done } = await fetchTimed(src, 15_000, { Referer: pageUrl, Accept: 'image/avif,image/webp,image/*,*/*;q=0.8' });
        try {
          const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
          if (!res.ok || !type.startsWith('image/')) return;
          const buf = await readLimited(res, MAX_IMAGE_BYTES);
          const ext = extFromMime(type) || path.extname(new URL(src).pathname).slice(0, 6) || '.img';
          const file = `img-${i + 1}${ext}`;
          await fs.promises.writeFile(path.join(folderAbs, file), buf);
          saved.set(src, file);
        } finally { done(); }
      } catch {}
    });
    const localImage = (img: any) => {
      if (tinyImage(img)) return null;
      const src = bestImageSrc(img, pageUrl);
      if (!src) return null;
      const file = saved.get(src);
      return file ? uploadsUrl(`${folder}/${file}`) : src;
    };

    // ---- the document ----
    const savedAt = new Date();
    const header: any[] = [
      { type: 'paragraph', content: [
        text('🌐 '), link(pageUrl, article?.siteName || host),
        ...(article?.byline ? [text(` · ${String(article.byline).trim()}`)] : []),
        ...(article?.publishedTime ? [text(` · ${String(article.publishedTime).slice(0, 10)}`)] : []),
      ] },
      { type: 'paragraph', content: [
        text(`Saved ${savedAt.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })} · `, { italic: true }),
        link(uploadsUrl(`${folder}/article.html`), 'Offline copy'),
        text(' · '),
        link(uploadsUrl(`${folder}/page.html`), 'Full page'),
      ] },
    ];
    const body = htmlToBlocks(readable.body, { pageUrl, imageUrl: localImage });
    const content = [...header, ...body];

    // ---- saved copies (scripts removed) ----
    sanitize(readable);
    for (const img of Array.from(readable.querySelectorAll('img')) as any[]) {
      const src = bestImageSrc(img, pageUrl);
      const file = src ? saved.get(src) : null;
      if (src) img.setAttribute('src', file || src);
      ['srcset', 'data-src', 'data-srcset', 'loading'].forEach(a => img.removeAttribute(a));
    }
    for (const a of Array.from(readable.querySelectorAll('a[href]')) as any[]) {
      const href = absolute(a.getAttribute('href'), pageUrl);
      if (href) a.setAttribute('href', href);
    }
    const articleHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  body { max-width: 760px; margin: 40px auto; padding: 0 20px; font: 18px/1.65 Georgia, serif; color: #222; background: #fdfdfb; }
  img, video { max-width: 100%; height: auto; } pre { overflow-x: auto; background: #f3f3f3; padding: 12px; }
  table { border-collapse: collapse; } td, th { border: 1px solid #ccc; padding: 4px 8px; }
  .saved { font: 13px/1.5 system-ui, sans-serif; color: #777; border-bottom: 1px solid #ddd; padding-bottom: 12px; margin-bottom: 24px; }
</style></head>
<body>
<div class="saved">Saved ${esc(savedAt.toLocaleString('en-US'))} from <a href="${esc(pageUrl)}">${esc(pageUrl)}</a>${article?.byline ? ` · ${esc(article.byline)}` : ''}</div>
<h1>${esc(title)}</h1>
${readable.body.innerHTML}
</body></html>`;
    await fs.promises.writeFile(path.join(folderAbs, 'article.html'), articleHtml);

    await this.inlineStylesheets(page, pageUrl);
    sanitize(page);
    for (const img of Array.from(page.querySelectorAll('img')) as any[]) {
      const src = bestImageSrc(img, pageUrl);
      if (!src) continue;
      const file = saved.get(src);
      img.setAttribute('src', file ? uploadsUrl(`${folder}/${file}`) : src);
      if (file) img.removeAttribute('srcset');
      img.removeAttribute('loading');
    }
    absolutizeAll(page, pageUrl);   // pictures, styles and links not copied still load from the site
    const head = page.head || page.querySelector('head');
    if (head) {
      const charset = page.createElement('meta');
      charset.setAttribute('charset', 'utf-8');
      head.insertBefore(charset, head.firstChild);
    }
    page.body?.insertAdjacentHTML?.('afterbegin',
      `<div style="all:initial;display:block;font:13px system-ui,sans-serif;background:#1e1e2e;color:#ccc;padding:6px 12px;position:relative;z-index:2147483647">` +
      `📦 Saved copy from ${esc(savedAt.toLocaleString('en-US'))} — <a style="color:#60a5fa" href="${esc(pageUrl)}">${esc(pageUrl)}</a></div>`);
    await fs.promises.writeFile(path.join(folderAbs, 'page.html'), '<!DOCTYPE html>\n' + page.documentElement.outerHTML);

    // ---- database: the document, then the library entry ----
    const doc = (await this.db.query(
      `INSERT INTO node_documents (node_id, group_name, title, content) VALUES ($1, $2, $3, $4)
       RETURNING id, node_id, group_name, title, sort_order, created_at, updated_at`,
      [opts.nodeId ?? null, opts.groupName || GROUP, title, JSON.stringify(content)],
    )).rows[0];
    this.backlinks.enqueue(() => this.backlinks.reindexDocument(doc.id));

    let size = 0;
    for (const f of await fs.promises.readdir(folderAbs)) {
      try { size += (await fs.promises.stat(path.join(folderAbs, f))).size; } catch {}
    }
    const file = await this.files.register({
      path: `${folder}/page.html`, name: title, mime: 'text/html', size,
      nodeId: opts.nodeId ?? null, sourceUrl: pageUrl, kind: 'web', documentId: doc.id,
    });
    this.logger.log(`Saved page "${title}" (${body.length} blocks, ${saved.size}/${wanted.length} images)`);
    return { kind: 'page' as const, document: { ...doc, relation: 'home' }, file, images: { saved: saved.size, found: wanted.length } };
  }

  // Copy the page's stylesheets into it so the saved page keeps its look
  private async inlineStylesheets(page: any, pageUrl: string) {
    const links = (Array.from(page.querySelectorAll('link[rel~="stylesheet"][href]')) as any[]).slice(0, MAX_STYLESHEETS);
    await mapLimit(links, 4, async (el) => {
      const href = absolute(el.getAttribute('href'), pageUrl);
      if (!href) return;
      try {
        const { res, done } = await fetchTimed(href, 10_000, { Referer: pageUrl, Accept: 'text/css,*/*;q=0.1' });
        try {
          if (!res.ok) return;
          const css = (await readLimited(res, 2 * 1024 * 1024)).toString('utf8')
            // url(...) and @import inside the CSS are relative to the stylesheet, not the page
            .replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, q, u) => (/^(data:|#)/i.test(u) ? m : `url(${q}${absolute(u, href) || u}${q})`))
            .replace(/@import\s+(['"])([^'"]+)\1/g, (m, q, u) => `@import ${q}${absolute(u, href) || u}${q}`)
            .replace(/<\/style/gi, '<\\/style');
          const style = page.createElement('style');
          const media = el.getAttribute('media');
          if (media) style.setAttribute('media', media);
          style.textContent = css;
          el.replaceWith(style);
        } finally { done(); }
      } catch {}
    });
  }

  // Node chosen by name in the browser button ("" = Unfiled); aliases count too
  async findNodeByName(name?: string | null): Promise<{ id: number; name: string } | null> {
    const n = String(name || '').trim();
    if (!n) return null;
    const res = await this.db.query(
      `SELECT id, name FROM mindmap_nodes
       WHERE lower(name) = lower($1)
          OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(
                CASE WHEN jsonb_typeof(metadata::jsonb->'aliases') = 'array' THEN metadata::jsonb->'aliases' ELSE '[]'::jsonb END) a
             WHERE lower(a) = lower($1))
       ORDER BY (lower(name) = lower($1)) DESC LIMIT 1`,
      [n],
    );
    return res.rows[0] || null;
  }
}