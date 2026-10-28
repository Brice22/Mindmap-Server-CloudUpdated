// ============================================================
// 📚 STUDY - LLE ladder notes, the Library (books + chapters) and Today
// ============================================================
// Everything you write here is kept as normal Docs on the node, so it is
// searchable, linkable, and any line written as a card ("term :: definition",
// "{{blank}}") becomes a question in the Quiz Center:
//   🪜 LLE notes  doc "🪜 LLE notes": a heading per level ("L3 Connection"),
//                 a sub-heading per representation ("Graphical"); cards
//                 under them land in that LLE cell
//   📝 Summary    doc "📝 Summary" on a chapter (or any node)
//
// 📚 LIBRARY  a book = node with role "book", its chapters = sub-nodes with
//   role "chapter" (metadata.chapter.number). The PDF is a file in 📁 Files
//   attached to the book (metadata.book.fileId). Progress = metadata.book.currentPage.
//   Finishing a chapter starts spaced chapter reviews (chapter_reviews):
//   1, 3, 7, 16, 35, 90 days, then every 180. Each review: write what you
//   remember, compare with your summary, rate it, connect it; a low rating
//   repeats the same step tomorrow instead of moving on.
//
// ✅ TODAY  your daily checklist (daily_items) and what you ticked (daily_checks)
// ============================================================

import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { MindmapService } from './mindmap.service';

const LEVELS = ['', 'Meaning', 'Procedure', 'Connection', 'Judgment', 'Creation'];
const REPS = ['verbal', 'graphical', 'concrete', 'symbolic', 'procedural', 'structural', 'intuitive'];
const REVIEW_DAYS = [1, 3, 7, 16, 35, 90];   // then every 180
export const LLE_DOC = '🪜 LLE notes';
export const SUMMARY_DOC = '📝 Summary';

const toId = (v: any) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const isDay = (d: any) => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const blockId = () => randomBytes(8).toString('hex');
const para = (text: string) => ({ id: blockId(), type: 'paragraph', props: {}, content: text, children: [] });
const heading = (level: number, text: string) => ({ id: blockId(), type: 'heading', props: { level }, content: text, children: [] });
// Plain text of a block (string content or inline content)
function blockText(b: any): string {
  const c = b?.content;
  if (typeof c === 'string') return c;
  if (!Array.isArray(c)) return '';
  return c.map((ic: any) => (typeof ic === 'string' ? ic : ic?.type === 'text' ? ic.text || ''
    : ic?.type === 'link' ? blockText({ content: ic.content }) : ic?.props?.name || (ic?.props?.latex ? `$${ic.props.latex}$` : ''))).join('');
}
const headingLevelOf = (b: any) => (b?.type === 'heading' ? Number(b.props?.level) || 1 : 0);
const lleLevelOf = (t: string) => { const m = /^\s*(?:L|Level\s*)([1-5])\b/i.exec(t); return m ? Number(m[1]) : null; };
const repOf = (t: string) => REPS.find(r => t.trim().toLowerCase().startsWith(r)) || null;
function addDays(day: string, n: number) {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class StudyService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(MindmapService) private readonly mindmap: MindmapService,
  ) {}

  // ============================================================
  // DOCS kept by the study tools
  // ============================================================
  private async findDoc(nodeId: number, title: string) {
    return (await this.db.query(
      'SELECT id, content FROM node_documents WHERE node_id = $1 AND title = $2 ORDER BY id LIMIT 1', [nodeId, title])).rows[0] || null;
  }

  private async node(nodeId: any) {
    const id = toId(nodeId);
    const n = id ? (await this.db.query('SELECT id, name, metadata FROM mindmap_nodes WHERE id = $1', [id])).rows[0] : null;
    if (!n) throw new NotFoundException('No such node');
    return n;
  }

  // Save through the normal document path, so cards, backlinks and search update
  private async saveDoc(nodeId: number, title: string, existing: any, content: any[]) {
    if (existing) { await this.mindmap.updateNodeDocument(existing.id, { content }); return existing.id; }
    const created = await this.mindmap.createNodeDocument(nodeId, { title, groupName: 'Study', content });
    return created.id;
  }

  // 🪜 Add lines under "L{level} {Name}" → "{Rep}" (headings made in order when missing)
  async addLleNote(b: any) {
    const n = await this.node(b.nodeId);
    const level = Number(b.level);
    const rep = String(b.rep || '');
    if (!(level >= 1 && level <= 5) || !REPS.includes(rep)) throw new BadRequestException('Which LLE cell?');
    const lines = String(b.text || '').split('\n').map(s => s.trimEnd()).filter(s => s.trim());
    if (!lines.length) throw new BadRequestException('Write something first');
    const doc = await this.findDoc(n.id, LLE_DOC);
    const blocks: any[] = Array.isArray(doc?.content) ? [...doc.content] : [
      // (no card syntax in this line, or it would become a card itself)
      para(`LLE notes for ${n.name} — one heading per level, one sub-heading per representation. Card lines written under them (question, space, two colons, space, answer — or words in double braces) are put in that LLE cell.`),
    ];
    // Level section: its heading (H2) up to the next H2 or less
    let li = blocks.findIndex(x => headingLevelOf(x) === 2 && lleLevelOf(blockText(x)) === level);
    if (li < 0) {
      const after = blocks.findIndex(x => headingLevelOf(x) === 2 && (lleLevelOf(blockText(x)) || 0) > level);
      li = after < 0 ? blocks.length : after;
      blocks.splice(li, 0, heading(2, `L${level} ${LEVELS[level]}`));
    }
    let sectionEnd = blocks.findIndex((x, i) => i > li && headingLevelOf(x) > 0 && headingLevelOf(x) <= 2);
    if (sectionEnd < 0) sectionEnd = blocks.length;
    // Representation sub-section (H3) in the standard order
    let ri = blocks.findIndex((x, i) => i > li && i < sectionEnd && headingLevelOf(x) === 3 && repOf(blockText(x)) === rep);
    if (ri < 0) {
      const later = blocks.findIndex((x, i) => i > li && i < sectionEnd && headingLevelOf(x) === 3
        && REPS.indexOf(repOf(blockText(x)) || '') > REPS.indexOf(rep));
      ri = later < 0 ? sectionEnd : later;
      blocks.splice(ri, 0, heading(3, cap(rep)));
    }
    let end = blocks.findIndex((x, i) => i > ri && headingLevelOf(x) > 0 && headingLevelOf(x) <= 3);
    if (end < 0) end = blocks.length;
    blocks.splice(end, 0, ...lines.map(para));
    const docId = await this.saveDoc(n.id, LLE_DOC, doc, blocks);
    return { docId, added: lines.length };
  }

  // 🪜 What's written in each cell: { "3:graphical": ["…", …] }
  async lleNotes(nodeId: any) {
    const n = await this.node(nodeId);
    const doc = await this.findDoc(n.id, LLE_DOC);
    const cells: Record<string, string[]> = {};
    let level: number | null = null, rep: string | null = null;
    for (const b of Array.isArray(doc?.content) ? doc.content : []) {
      const h = headingLevelOf(b), t = blockText(b);
      if (h === 2) { level = lleLevelOf(t); rep = null; continue; }
      if (h === 3) { rep = level ? repOf(t) : null; continue; }
      if (h) continue;
      if (level && rep && t.trim()) (cells[`${level}:${rep}`] ||= []).push(t);
    }
    return { docId: doc?.id ?? null, cells };
  }

  // 📝 Summary of a chapter (or any node)
  async summary(nodeId: any) {
    const n = await this.node(nodeId);
    const doc = await this.findDoc(n.id, SUMMARY_DOC);
    const lines = (Array.isArray(doc?.content) ? doc.content : []).map(blockText).filter((t: string) => t.trim());
    return { docId: doc?.id ?? null, text: lines.join('\n') };
  }

  async addSummary(nodeId: any, b: any) {
    const n = await this.node(nodeId);
    const lines = String(b.text || '').split('\n').map(s => s.trimEnd()).filter(s => s.trim());
    if (!lines.length) throw new BadRequestException('Write the summary first');
    const doc = await this.findDoc(n.id, SUMMARY_DOC);
    const blocks = Array.isArray(doc?.content) ? [...doc.content] : [];
    if (blocks.length && b.dated !== false) blocks.push(heading(3, `Added ${new Date().toISOString().slice(0, 10)}`));
    blocks.push(...lines.map(para));
    return { docId: await this.saveDoc(n.id, SUMMARY_DOC, doc, blocks) };
  }

  // ============================================================
  // 📚 LIBRARY
  // ============================================================
  async library(dayRaw?: string) {
    const day = isDay(dayRaw) ? dayRaw! : new Date().toISOString().slice(0, 10);
    const [nodes, files, cards, docs, reviews] = await Promise.all([
      this.db.query(`SELECT id, name, description, metadata FROM mindmap_nodes WHERE metadata->>'role' IN ('book', 'chapter')`),
      this.db.query(`SELECT f.* FROM files f
                     JOIN mindmap_nodes n ON n.id = f.node_id WHERE n.metadata->>'role' IN ('book', 'chapter')
                     ORDER BY f.id`),
      this.db.query(`SELECT node_id, COUNT(*)::int AS n, SUM(CASE WHEN next_review IS NULL OR next_review <= $1 THEN 1 ELSE 0 END)::int AS due
                     FROM flashcards WHERE node_id IS NOT NULL GROUP BY node_id`, [day]),
      this.db.query(`SELECT node_id, id, title FROM node_documents WHERE title = ANY($1::text[]) AND node_id IS NOT NULL`, [[SUMMARY_DOC, LLE_DOC]]),
      this.db.query(`SELECT DISTINCT ON (chapter_id) chapter_id, id, step, due, done_at FROM chapter_reviews
                     WHERE done_at IS NULL ORDER BY chapter_id, due`),
    ]);
    const meta = (r: any) => (typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : r.metadata || {});
    const cardsBy = new Map<number, any>(cards.rows.map((r: any) => [r.node_id, r]));
    const docBy = (id: number, title: string) => docs.rows.find((d: any) => d.node_id === id && d.title === title)?.id ?? null;
    const reviewBy = new Map<number, any>(reviews.rows.map((r: any) => [r.chapter_id, r]));
    const filesOf = (id: number) => files.rows.filter((f: any) => f.node_id === id);
    const all = nodes.rows.map((r: any) => ({ ...r, meta: meta(r) }));
    const books = all.filter((r: any) => r.meta.role === 'book');
    return books.map((bk: any) => {
      const chapters = all
        .filter((c: any) => c.meta.role === 'chapter' && String(c.meta.parent || '').toLowerCase() === bk.name.toLowerCase())
        .sort((a: any, b: any) => (Number(a.meta.chapter?.number ?? 9999) - Number(b.meta.chapter?.number ?? 9999)) || a.name.localeCompare(b.name))
        .map((c: any) => {
          const rv: any = reviewBy.get(c.id);
          return {
            id: c.id, name: c.name, chapter: c.meta.chapter || {},
            cards: cardsBy.get(c.id)?.n || 0, cardsDue: cardsBy.get(c.id)?.due || 0,
            summaryDocId: docBy(c.id, SUMMARY_DOC), lleDocId: docBy(c.id, LLE_DOC), files: filesOf(c.id),
            nextReview: rv ? { id: rv.id, step: rv.step, due: typeof rv.due === 'string' ? rv.due : new Date(rv.due).toISOString().slice(0, 10) } : null,
          };
        });
      return {
        id: bk.id, name: bk.name, description: bk.description, book: bk.meta.book || {}, tags: bk.meta.tags || [],
        files: filesOf(bk.id), cards: cardsBy.get(bk.id)?.n || 0, summaryDocId: docBy(bk.id, SUMMARY_DOC), chapters,
      };
    }).sort((a: any, b: any) => {
      const order = (s: string) => (s === 'reading' ? 0 : s === 'planned' ? 1 : 2);
      return order(a.book.status || 'reading') - order(b.book.status || 'reading') || a.name.localeCompare(b.name);
    });
  }

  // Add a book (and, if asked, its chapters "Chapter 1" … "Chapter N")
  async addBook(b: any) {
    const name = String(b.name || '').trim();
    if (!name) throw new BadRequestException('Give the book a title');
    if ((await this.db.query('SELECT 1 FROM mindmap_nodes WHERE lower(name) = lower($1)', [name])).rows.length)
      throw new BadRequestException('A node with that name already exists — add the author or edition to the title');
    const total = Math.max(0, Math.round(Number(b.totalPages) || 0));
    const book = await this.mindmap.createNode(name, String(b.description || ''), 'concept', {
      role: 'book', tags: Array.isArray(b.tags) ? b.tags : [],
      book: { author: String(b.author || ''), totalPages: total || null, currentPage: 0, status: b.status === 'planned' ? 'planned' : 'reading' },
    });
    const count = Math.min(200, Math.max(0, Math.round(Number(b.chapters) || 0)));
    for (let i = 1; i <= count; i++) await this.addChapter(book.id, { name: `${name} — Chapter ${i}`, number: i });
    return { id: book.id };
  }

  async addChapter(bookId: any, b: any) {
    const bk = await this.node(bookId);
    const number = Number(b.number);
    const name = String(b.name || '').trim() || `${bk.name} — Chapter ${number || ''}`.trim();
    if ((await this.db.query('SELECT 1 FROM mindmap_nodes WHERE lower(name) = lower($1)', [name])).rows.length)
      throw new BadRequestException(`A node named "${name}" already exists`);
    const ch = await this.mindmap.createNode(name, '', 'concept', {
      parent: bk.name, role: 'chapter',
      chapter: { number: Number.isFinite(number) && number > 0 ? number : null,
        startPage: toId(b.startPage), endPage: toId(b.endPage) },
    });
    return { id: ch.id };
  }

  // Finished (or not): finishing schedules the first review for tomorrow
  async finishChapter(chapterId: any, b: any) {
    const ch = await this.node(chapterId);
    const day = isDay(b.day) ? b.day : new Date().toISOString().slice(0, 10);
    const m = typeof ch.metadata === 'string' ? JSON.parse(ch.metadata) : ch.metadata || {};
    const finished = b.finished !== false;
    await this.mindmap.updateNode(ch.id, undefined, undefined, { chapter: { ...(m.chapter || {}), finishedAt: finished ? day : null } });
    await this.db.query('DELETE FROM chapter_reviews WHERE chapter_id = $1 AND done_at IS NULL', [ch.id]);
    if (finished) {
      await this.db.query('INSERT INTO chapter_reviews (chapter_id, step, due) VALUES ($1, 0, $2)', [ch.id, addDays(day, REVIEW_DAYS[0])]);
    }
    return { finished, firstReview: finished ? addDays(day, REVIEW_DAYS[0]) : null };
  }

  // Chapter reviews due on or before this day
  async dueReviews(dayRaw?: string) {
    const day = isDay(dayRaw) ? dayRaw! : new Date().toISOString().slice(0, 10);
    const res = await this.db.query(
      `SELECT r.id, r.chapter_id, r.step, to_char(r.due, 'YYYY-MM-DD') AS due, c.name AS chapter,
              c.metadata->>'parent' AS book
       FROM chapter_reviews r JOIN mindmap_nodes c ON c.id = r.chapter_id
       WHERE r.done_at IS NULL AND r.due <= $1 ORDER BY r.due, r.id`, [day]);
    return res.rows;
  }

  async reviewHistory(chapterId: any) {
    const ch = await this.node(chapterId);
    return (await this.db.query(
      `SELECT id, step, to_char(due, 'YYYY-MM-DD') AS due, done_at, rating, recall, connections
       FROM chapter_reviews WHERE chapter_id = $1 ORDER BY id DESC LIMIT 30`, [ch.id])).rows;
  }

  // Finish a review: rating 1–4 (how much you recalled). 3–4 → next step; 1–2 → same step tomorrow
  async completeReview(reviewId: any, b: any) {
    const id = toId(reviewId);
    const r = id ? (await this.db.query('SELECT * FROM chapter_reviews WHERE id = $1', [id])).rows[0] : null;
    if (!r) throw new NotFoundException('No such review');
    if (r.done_at) throw new BadRequestException('That review is already done');
    const rating = Math.round(Number(b.rating));
    if (!(rating >= 1 && rating <= 4)) throw new BadRequestException('Rate how much you remembered (1–4)');
    const day = isDay(b.day) ? b.day : new Date().toISOString().slice(0, 10);
    await this.db.query(
      'UPDATE chapter_reviews SET done_at = NOW(), rating = $2, recall = $3, connections = $4 WHERE id = $1',
      [r.id, rating, b.recall ? String(b.recall).slice(0, 20000) : null, b.connections ? String(b.connections).slice(0, 20000) : null]);
    const nextStep = rating >= 3 ? r.step + 1 : r.step;
    const wait = rating >= 3 ? (REVIEW_DAYS[nextStep] ?? 180) : 1;
    const due = addDays(day, wait);
    await this.db.query('INSERT INTO chapter_reviews (chapter_id, step, due) VALUES ($1, $2, $3)', [r.chapter_id, nextStep, due]);
    // Connections also go in with your Level-4 synthesis answers
    if (b.connections && String(b.connections).trim()) {
      await this.db.query('INSERT INTO quiz_reflections (node_ids, prompt, response) VALUES ($1::int[], $2, $3)',
        [[r.chapter_id], 'Chapter review: how does this chapter connect to what you already know?', String(b.connections).slice(0, 20000)]);
    }
    return { nextDue: due, nextStep };
  }

  // ============================================================
  // ✅ TODAY
  // ============================================================
  async today(fromRaw?: string, toRaw?: string) {
    const to = isDay(toRaw) ? toRaw! : new Date().toISOString().slice(0, 10);
    const from = isDay(fromRaw) ? fromRaw! : addDays(to, -400);
    const tz = process.env.TZ || 'America/Chicago';
    const [items, checks, articles] = await Promise.all([
      this.db.query('SELECT id, name, icon, sort_order, active, target_minutes FROM daily_items ORDER BY sort_order, id'),
      this.db.query(`SELECT item_id, to_char(day, 'YYYY-MM-DD') AS day, minutes, note FROM daily_checks
                     WHERE day BETWEEN $1 AND $2 ORDER BY day`, [from, to]),
      this.db.query(`SELECT COUNT(*)::int AS n FROM saved_articles
                     WHERE read_at IS NOT NULL
                       AND ((read_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE $1)::date = $2::date`, [tz, to])
        .catch(() => ({ rows: [{ n: 0 }] })),
    ]);
    return { items: items.rows, checks: checks.rows, articlesReadToday: articles.rows[0]?.n || 0 };
  }

  async addItem(b: any) {
    const name = String(b.name || '').trim().slice(0, 60);
    if (!name) throw new BadRequestException('Name the habit');
    const res = await this.db.query(
      `INSERT INTO daily_items (name, icon, target_minutes, sort_order)
       VALUES ($1, $2, $3, COALESCE((SELECT MAX(sort_order) + 1 FROM daily_items), 1)) RETURNING *`,
      [name, String(b.icon || '✅').slice(0, 8), toId(b.targetMinutes)]);
    return res.rows[0];
  }

  async updateItem(id: any, b: any) {
    const itemId = toId(id);
    if (!itemId) throw new BadRequestException('Which habit?');
    const res = await this.db.query(
      `UPDATE daily_items SET name = COALESCE($2, name), icon = COALESCE($3, icon), active = COALESCE($4, active),
              sort_order = COALESCE($5, sort_order),
              target_minutes = CASE WHEN $6::boolean THEN $7 ELSE target_minutes END
       WHERE id = $1 RETURNING *`,
      [itemId, b.name ? String(b.name).trim().slice(0, 60) : null, b.icon ? String(b.icon).slice(0, 8) : null,
       typeof b.active === 'boolean' ? b.active : null, Number.isFinite(Number(b.sortOrder)) && b.sortOrder !== null && b.sortOrder !== undefined ? Number(b.sortOrder) : null,
       b.targetMinutes !== undefined, toId(b.targetMinutes)]);
    if (!res.rows[0]) throw new NotFoundException('No such habit');
    return res.rows[0];
  }

  // Tick / untick a habit for a day (minutes and a note are optional)
  async setCheck(b: any) {
    const itemId = toId(b.itemId);
    if (!itemId || !isDay(b.day)) throw new BadRequestException('Which habit and day?');
    if (b.done === false) {
      await this.db.query('DELETE FROM daily_checks WHERE item_id = $1 AND day = $2', [itemId, b.day]);
      return { done: false };
    }
    const minutes = Number.isFinite(Number(b.minutes)) && Number(b.minutes) > 0 ? Math.min(1440, Math.round(Number(b.minutes))) : null;
    await this.db.query(
      `INSERT INTO daily_checks (item_id, day, minutes, note) VALUES ($1, $2, $3, $4)
       ON CONFLICT (item_id, day) DO UPDATE SET minutes = EXCLUDED.minutes, note = EXCLUDED.note`,
      [itemId, b.day, minutes, b.note ? String(b.note).slice(0, 500) : null]);
    return { done: true };
  }
}