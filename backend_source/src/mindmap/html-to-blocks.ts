// ============================================================
// HTML → BlockNote blocks (for saved web pages)
// ============================================================
// Turns the readable part of a web page into the same block format
// the Docs editor saves, so a saved page is a normal document:
// editable, searchable and scanned for backlinks.
//   h1–h6 → heading · p → paragraph · ul/ol → list items (nested)
//   blockquote → quote · pre → code block · hr → divider
//   img/figure → image (with caption) · table → table
//   YouTube/Vimeo iframes → embed block
//   bold / italic / underline / strike / code / links inside text
// Anything else is read for its text.
// ============================================================

type Styles = { bold?: true; italic?: true; underline?: true; strike?: true; code?: true };
type Text = { type: 'text'; text: string; styles: Styles };
type Link = { type: 'link'; href: string; content: Text[] };
type Inline = Text | Link;

export interface ConvertOptions {
  pageUrl: string;
  imageUrl: (img: any) => string | null;   // saved copy (or absolute original) for an <img>; null = skip it
  maxBlocks?: number;
}

const BLOCK_TAGS = new Set([
  'p', 'div', 'section', 'article', 'main', 'header', 'footer', 'aside', 'nav', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'figure', 'table', 'hr', 'dl', 'dt', 'dd', 'details', 'summary',
  'iframe', 'video', 'audio', 'picture', 'form', 'fieldset', 'address', 'center',
]);
const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg', 'button', 'input', 'select', 'textarea', 'canvas', 'object', 'embed']);

const tag = (el: any): string => (el?.tagName || '').toLowerCase();

function absolute(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const u = new URL(href.trim(), base);
    return u.protocol === 'http:' || u.protocol === 'https:' || u.protocol === 'mailto:' ? u.href : null;
  } catch { return null; }
}

// Merge neighbouring text with the same styles; trim the ends
function tidy(items: Inline[]): Inline[] {
  const out: Inline[] = [];
  for (const it of items) {
    const prev = out[out.length - 1];
    if (it.type === 'text' && prev?.type === 'text' && JSON.stringify(prev.styles) === JSON.stringify(it.styles)) {
      prev.text += it.text;
    } else if (it.type === 'link' && prev?.type === 'link' && prev.href === it.href) {
      prev.content.push(...it.content);
    } else {
      out.push(it.type === 'text' ? { ...it } : { ...it, content: it.content.map(c => ({ ...c })) });
    }
  }
  // collapse double spaces across item boundaries, trim start/end
  const texts = (i: Inline): Text[] => (i.type === 'text' ? [i] : i.content);
  let lastSpace = true;
  for (const item of out) {
    for (const t of texts(item)) {
      if (t.styles.code) { lastSpace = false; continue; }
      t.text = t.text.replace(/[ \t\r\f\v]+/g, ' ');
      if (lastSpace) t.text = t.text.replace(/^ /, '');
      if (t.text.length) lastSpace = t.text.endsWith(' ') || t.text.endsWith('\n');
    }
  }
  for (let i = out.length - 1; i >= 0; i--) {
    const ts = texts(out[i]);
    const last = ts[ts.length - 1];
    if (last) last.text = last.text.replace(/\s+$/, '');
    if (ts.every(t => !t.text)) { out.splice(i, 1); continue; }
    break;
  }
  return out.filter(i => texts(i).some(t => t.text));
}

const plain = (items: Inline[]) => items.map(i => (i.type === 'text' ? i.text : i.content.map(c => c.text).join(''))).join('');

export function htmlToBlocks(root: any, opts: ConvertOptions): any[] {
  const max = opts.maxBlocks ?? 4000;
  let count = 0;
  const push = (out: any[], b: any) => { if (count < max) { out.push(b); count++; } };

  // ---------- inline content ----------
  // Images met inside text are collected and added as image blocks after the paragraph
  const inline = (node: any, styles: Styles, images: any[], href?: string): Inline[] => {
    if (node.nodeType === 3) {
      const text = String(node.nodeValue || '').replace(/\s+/g, ' ');
      if (!text) return [];
      const t: Text = { type: 'text', text, styles: { ...styles } };
      return href ? [{ type: 'link', href, content: [t] }] : [t];
    }
    if (node.nodeType !== 1) return [];
    const t = tag(node);
    if (SKIP_TAGS.has(t)) return [];
    if (t === 'img') { images.push(node); return []; }
    if (t === 'br') return [{ type: 'text', text: '\n', styles: {} }];
    const s: Styles = { ...styles };
    if (t === 'b' || t === 'strong') s.bold = true;
    if (t === 'i' || t === 'em' || t === 'cite' || t === 'dfn') s.italic = true;
    if (t === 'u' || t === 'ins') s.underline = true;
    if (t === 's' || t === 'del' || t === 'strike') s.strike = true;
    if (t === 'code' || t === 'kbd' || t === 'samp' || t === 'tt') s.code = true;
    let link = href;
    if (t === 'a' && !href) link = absolute(node.getAttribute('href'), opts.pageUrl) || undefined;
    const out: Inline[] = [];
    for (const child of Array.from(node.childNodes || []) as any[]) {
      // block elements inside inline context: keep a space between them
      if (child.nodeType === 1 && BLOCK_TAGS.has(tag(child)) && out.length) out.push({ type: 'text', text: ' ', styles: {} });
      out.push(...inline(child, s, images, link));
    }
    return out;
  };

  const imageBlock = (out: any[], img: any, caption = '') => {
    const url = opts.imageUrl(img);
    if (!url) return;
    const alt = (img.getAttribute('alt') || '').trim();
    push(out, { type: 'image', props: { url, caption: caption || alt, name: alt.slice(0, 80) } });
  };

  const paragraph = (out: any[], items: Inline[], images: any[] = []) => {
    const content = tidy(items);
    if (content.length) push(out, { type: 'paragraph', content });
    images.forEach(img => imageBlock(out, img));
  };

  // ---------- lists ----------
  const list = (out: any[], el: any, ordered: boolean) => {
    for (const li of Array.from(el.childNodes || []) as any[]) {
      if (li.nodeType !== 1) continue;
      if (tag(li) !== 'li') { walk(out, { childNodes: [li] }); continue; }   // stray blocks inside a list
      const images: any[] = [];
      const content: Inline[] = [];
      const children: any[] = [];
      for (const c of Array.from(li.childNodes || []) as any[]) {
        const ct = tag(c);
        if (ct === 'ul' || ct === 'ol') list(children, c, ct === 'ol');
        else if (ct === 'pre' || ct === 'table' || ct === 'blockquote') walk(children, { childNodes: [c] });
        else {
          if (c.nodeType === 1 && BLOCK_TAGS.has(ct) && content.length) content.push({ type: 'text', text: ' ', styles: {} });
          content.push(...inline(c, {}, images));
        }
      }
      images.forEach(img => imageBlock(children, img));
      push(out, { type: ordered ? 'numberedListItem' : 'bulletListItem', content: tidy(content), children });
    }
  };

  // ---------- tables ----------
  const table = (out: any[], el: any) => {
    const rows: any[] = Array.from(el.querySelectorAll('tr'))
      .filter((tr: any) => tr.closest('table') === el)
      .slice(0, 300);
    if (!rows.length) return;
    let headerRows = 0;
    const cells = rows.map((tr: any, i: number) => {
      const tds = (Array.from(tr.children || []) as any[]).filter(c => tag(c) === 'td' || tag(c) === 'th');
      if (i === headerRows && tds.length && tds.every(c => tag(c) === 'th')) headerRows++;
      return tds.slice(0, 30).map(td => tidy(inline(td, {}, [])));
    }).filter(r => r.length);
    if (!cells.length) return;
    const width = Math.max(...cells.map(r => r.length));
    push(out, {
      type: 'table',
      content: {
        type: 'tableContent',
        ...(headerRows ? { headerRows: 1 } : {}),
        rows: cells.map(r => ({ cells: [...r, ...Array(width - r.length).fill([])] })),
      },
    });
  };

  // ---------- blocks ----------
  const walk = (out: any[], el: any) => {
    let buffer: Inline[] = [];
    let images: any[] = [];
    const flush = () => { paragraph(out, buffer, images); buffer = []; images = []; };

    for (const node of Array.from(el.childNodes || []) as any[]) {
      if (count >= max) return;
      const t = tag(node);
      if (node.nodeType === 3 || (node.nodeType === 1 && !BLOCK_TAGS.has(t) && t !== 'img')) {
        buffer.push(...inline(node, {}, images));
        continue;
      }
      if (node.nodeType !== 1 || SKIP_TAGS.has(t)) continue;
      flush();

      if (/^h[1-6]$/.test(t)) {
        const imgs: any[] = [];
        const content = tidy(inline(node, {}, imgs));
        if (content.length) push(out, { type: 'heading', props: { level: Math.min(Number(t[1]), 3) }, content });
        imgs.forEach(img => imageBlock(out, img));
      } else if (t === 'p' || t === 'dt' || t === 'dd' || t === 'summary' || t === 'address') {
        const hasBlocks = (Array.from(node.children || []) as any[]).some(c => BLOCK_TAGS.has(tag(c)) && tag(c) !== 'p');
        if (hasBlocks) walk(out, node);
        else { const imgs: any[] = []; paragraph(out, inline(node, {}, imgs), imgs); }
      } else if (t === 'ul' || t === 'ol') {
        list(out, node, t === 'ol');
      } else if (t === 'blockquote') {
        const imgs: any[] = [];
        const content = tidy(inline(node, {}, imgs));
        if (content.length) push(out, { type: 'quote', content });
        imgs.forEach(img => imageBlock(out, img));
      } else if (t === 'pre') {
        const text = String(node.textContent || '').replace(/\n+$/, '');
        if (text.trim()) push(out, { type: 'codeBlock', props: { language: 'text' }, content: [{ type: 'text', text, styles: {} }] });
      } else if (t === 'hr') {
        push(out, { type: 'divider' });
      } else if (t === 'img') {
        imageBlock(out, node);
      } else if (t === 'figure' || t === 'picture') {
        const cap = node.querySelector('figcaption');
        const caption = cap ? plain(tidy(inline(cap, {}, []))) : '';
        const imgs = Array.from(node.querySelectorAll('img')) as any[];
        if (imgs.length) imgs.forEach((img, i) => imageBlock(out, img, i === 0 ? caption : ''));
        else walk(out, node);
      } else if (t === 'table') {
        table(out, node);
      } else if (t === 'iframe') {
        const src = absolute(node.getAttribute('src'), opts.pageUrl);
        if (src && /youtube(-nocookie)?\.com|youtu\.be|vimeo\.com/.test(src)) push(out, { type: 'embed', props: { url: src, height: 360 } });
      } else if (t === 'video' || t === 'audio') {
        const src = absolute(node.getAttribute('src') || node.querySelector('source')?.getAttribute('src'), opts.pageUrl);
        if (src) paragraph(out, [{ type: 'link', href: src, content: [{ type: 'text', text: t === 'video' ? '▶ Video' : '🔊 Audio', styles: {} }] }]);
      } else {
        walk(out, node);   // div, section, article, li outside a list, …
      }
    }
    flush();
  };

  const blocks: any[] = [];
  walk(blocks, root);
  return blocks;
}