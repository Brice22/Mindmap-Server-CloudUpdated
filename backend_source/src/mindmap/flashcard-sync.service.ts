// ============================================================
// FLASHCARD SYNC - flashcards written inside Docs → Quiz Center
// ============================================================
// Two ways to write a card while taking notes:
//   1. /flashcard block   (Question + Answer boxes)
//   2. any line with  ::  (spaces around it), e.g.
//      "Mitochondria :: makes the cell's ATP"
//      (left side = question, right side = answer; "std::vector" is not a card)
// Every time a document is saved, its cards are matched to the
// "flashcards" table by document + block id:
//   - new card → added (due right away)
//   - edited card → question/answer updated, review history kept
//   - card removed from the doc → removed from the deck
// Cards belong to the document's home node, so a node's deck is
// everything written in its docs. Runs inside the backlinks job
// queue (reindexDocument), so it also covers restores and rebuilds.
// ============================================================

import { Injectable, Inject, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface DocCard { blockId: string; question: string; answer: string; solution?: string | null; lleLevel?: number | null; lleRep?: string | null }

const MAX_LEN = 2000;

// Plain text of a block's inline content (mentions and inline math included)
function inlineText(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((ic: any) => {
    if (typeof ic === 'string') return ic;
    if (ic.type === 'text') return ic.text || '';
    if (ic.type === 'link') return inlineText(ic.content);
    if (ic.type === 'nodeMention' || ic.type === 'place') return ic.props?.name || '';
    if (ic.type === 'inlineMath') return ic.props?.latex ? `$${ic.props.latex}$` : '';
    return '';
   }).join('');
}

// {{blanks}} outside $math$.
//   {{ATP}}            its own card (the other blanks shown as words)
//   {{c1::ATP}} … {{c1::NADH}}   same number = hidden together on ONE card
//   …::hint at the end of any blank shows the hint in its place
const CLOZE = /\{\{([^{}]+?)\}\}/g;
export function clozeCards(text: string, blockId: string): DocCard[] {
  // Hide math while looking for braces, so $\frac{{a}}{b}$ isn't a blank
  const masked = text.replace(/\$\$[\s\S]+?\$\$|\$[^$\n]+?\$/g, m => '\u0000'.repeat(m.length));
  const blanks: { start: number; end: number; answer: string; hint: string; group: number | null }[] = [];
  let m: RegExpExecArray | null;
  CLOZE.lastIndex = 0;
  while ((m = CLOZE.exec(masked))) {
    let inner = text.slice(m.index + 2, m.index + m[0].length - 2);
    const g = /^\s*c(\d+)\s*::/i.exec(inner);
    if (g) inner = inner.slice(g[0].length);
    const cut = inner.indexOf('::');
    const answer = (cut >= 0 ? inner.slice(0, cut) : inner).trim();
    const hint = cut >= 0 ? inner.slice(cut + 2).trim() : '';
    if (answer) blanks.push({ start: m.index, end: m.index + m[0].length, answer, hint, group: g ? Number(g[1]) : null });
  }
  // The line with some blanks hidden and the rest filled in
  const show = (hide: (i: number) => boolean) => {
    let out = '', at = 0;
    blanks.forEach((b, i) => {
      out += text.slice(at, b.start) + (hide(i) ? `[ ${b.hint || '…'} ]` : b.answer);
      at = b.end;
    });
    return out + text.slice(at);
  };
  const full = show(() => false).trim().slice(0, MAX_LEN);
  const cards: DocCard[] = [];
  // Ungrouped blanks: one card each, numbered among themselves from 1 (adding another keeps the first one's history)
  blanks.map((b, i) => ({ b, i })).filter(x => x.b.group == null).forEach((x, k) => cards.push({
    blockId: `${blockId}#c${k + 1}`,
    question: show(i => i === x.i).trim().slice(0, MAX_LEN),
    answer: x.b.answer.slice(0, MAX_LEN),
    solution: full,
  }));
  // Numbered groups: one card per number, all its blanks hidden
  const groups = Array.from(new Set(blanks.filter(b => b.group != null).map(b => b.group!))).sort((a, b) => a - b);
  for (const n of groups) {
    const members = blanks.filter(b => b.group === n);
    cards.push({
      blockId: `${blockId}#g${n}`,
      question: show(i => blanks[i].group === n).trim().slice(0, MAX_LEN),
      answer: members.map(b => b.answer).join(' · ').slice(0, MAX_LEN),
      solution: full,
    });
  }
  return cards;
}

// 🪜 LLE cell from the headings above a card: a heading starting "L3" (or "Level 3")
// sets the level, a representation name (Verbal, Graphical…) sets the representation.
// So in a doc laid out "L1 Meaning" → "Verbal" → card lines, those cards land in L1 · Verbal.
const LLE_LEVEL = /^\s*(?:L|Level\s*)([1-5])\b/i;
const LLE_REPS = ['verbal', 'graphical', 'concrete', 'symbolic', 'procedural', 'structural', 'intuitive'];
function headingCell(text: string): { level: number | null; rep: string | null } {
  const t = text.trim();
  const lv = LLE_LEVEL.exec(t);
  const lower = t.toLowerCase();
  const rep = lv
    ? LLE_REPS.find(r => new RegExp(`\\b${r}\\b`).test(lower)) || null
    : LLE_REPS.find(r => lower === r || lower.startsWith(`${r} `) || lower.startsWith(`${r}:`) || lower.startsWith(`${r} —`)) || null;
  return { level: lv ? Number(lv[1]) : null, rep };
}

export function extractCards(blocks: any[]): DocCard[] {
  const cards: DocCard[] = [];
  // Current LLE cell from headings, and how deep the heading that set the level was
  const cell = { level: null as number | null, rep: null as string | null, depth: 0, repDepth: 0 };
  const walk = (list: any[], path: string) => {
    (list || []).forEach((b: any, i: number) => {
      if (!b || typeof b !== 'object') return;
      const blockId = String(b.id || `${path}${i}`);
      const tag = (c: DocCard): DocCard => (cell.level || cell.rep ? { ...c, lleLevel: cell.level, lleRep: cell.rep } : c);
      if (b.type === 'heading') {
        const depth = Number(b.props?.level) || 1;
        const h = headingCell(inlineText(b.content));
        if (h.level) { cell.level = h.level; cell.rep = h.rep; cell.depth = depth; cell.repDepth = h.rep ? depth : 0; }
        else if (h.rep) { cell.rep = h.rep; cell.repDepth = depth; }
        else {   // another heading at the same or a higher level ends the LLE section
          if (cell.repDepth && depth <= cell.repDepth) { cell.rep = null; cell.repDepth = 0; }
          if (cell.depth && depth <= cell.depth) { cell.level = null; cell.rep = null; cell.depth = 0; cell.repDepth = 0; }
        }
      } else if (b.type === 'flashcard') {
        const q = String(b.props?.question || '').trim();
        const a = String(b.props?.answer || '').trim();
        if (q && a) cards.push(tag({ blockId, question: q.slice(0, MAX_LEN), answer: a.slice(0, MAX_LEN) }));
      } else if (b.type !== 'codeBlock' && b.type !== 'table') {
        const text = inlineText(b.content);
        const m = /\s::\s/.exec(text);
        if (/\{\{[^{}]+?\}\}/.test(text)) {
          cards.push(...clozeCards(text, blockId).map(tag));   // a {{blank}} line is a fill-in-the-blank card
        } else if (m) {
          const q = text.slice(0, m.index).trim();
          const a = text.slice(m.index + m[0].length).trim();
          if (q && a) cards.push(tag({ blockId, question: q.slice(0, MAX_LEN), answer: a.slice(0, MAX_LEN) }));
        }
      }
      if (Array.isArray(b.children) && b.children.length) walk(b.children, `${path}${i}.`);
    });
  };
  walk(Array.isArray(blocks) ? blocks : [], '');
  return cards;
}

@Injectable()
export class FlashcardSyncService {
  private readonly logger = new Logger(FlashcardSyncService.name);

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  // doc = row from node_documents (id, node_id, content)
  async syncDocument(doc: { id: number; node_id: number | null; content: any }) {
    const cards = extractCards(doc.content);
    let nodeName = 'Unfiled';
    if (doc.node_id) {
      const n = await this.db.query('SELECT name FROM mindmap_nodes WHERE id = $1', [doc.node_id]);
      nodeName = n.rows[0]?.name || nodeName;
       }
    for (const c of cards) {
      await this.db.query(
        `INSERT INTO flashcards (question, answer, node_id, node_name, document_id, block_id, next_review, solution, lle_level, lle_rep)
         VALUES ($1, $2, $3, $4, $5, $6, NULL, $7, $8, $9)
         ON CONFLICT (document_id, block_id) DO UPDATE
           SET question = EXCLUDED.question, answer = EXCLUDED.answer,
               node_id = EXCLUDED.node_id, node_name = EXCLUDED.node_name, solution = EXCLUDED.solution,
               lle_level = COALESCE(EXCLUDED.lle_level, flashcards.lle_level),
               lle_rep = COALESCE(EXCLUDED.lle_rep, flashcards.lle_rep)
         WHERE flashcards.question IS DISTINCT FROM EXCLUDED.question
            OR flashcards.answer IS DISTINCT FROM EXCLUDED.answer
            OR flashcards.node_id IS DISTINCT FROM EXCLUDED.node_id
            OR flashcards.solution IS DISTINCT FROM EXCLUDED.solution
            OR (EXCLUDED.lle_level IS NOT NULL AND flashcards.lle_level IS DISTINCT FROM EXCLUDED.lle_level)
            OR (EXCLUDED.lle_rep IS NOT NULL AND flashcards.lle_rep IS DISTINCT FROM EXCLUDED.lle_rep)`,
        [c.question, c.answer, doc.node_id, nodeName, doc.id, c.blockId, c.solution ?? null, c.lleLevel ?? null, c.lleRep ?? null],
      );
    }
    const removed = await this.db.query(
      `DELETE FROM flashcards WHERE document_id = $1 AND NOT (block_id = ANY($2::text[]))`,
      [doc.id, cards.map(c => c.blockId)],
    );
    if (removed.rowCount) this.logger.log(`Doc ${doc.id}: ${removed.rowCount} flashcard(s) removed`);
  }
}