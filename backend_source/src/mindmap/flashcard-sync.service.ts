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

export interface DocCard { blockId: string; question: string; answer: string }

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

export function extractCards(blocks: any[]): DocCard[] {
  const cards: DocCard[] = [];
  const walk = (list: any[], path: string) => {
    (list || []).forEach((b: any, i: number) => {
      if (!b || typeof b !== 'object') return;
      const blockId = String(b.id || `${path}${i}`);
      if (b.type === 'flashcard') {
        const q = String(b.props?.question || '').trim();
        const a = String(b.props?.answer || '').trim();
        if (q && a) cards.push({ blockId, question: q.slice(0, MAX_LEN), answer: a.slice(0, MAX_LEN) });
      } else if (b.type !== 'codeBlock' && b.type !== 'table') {
        const text = inlineText(b.content);
        const m = /\s::\s/.exec(text);
        if (m) {
          const q = text.slice(0, m.index).trim();
          const a = text.slice(m.index + m[0].length).trim();
          if (q && a) cards.push({ blockId, question: q.slice(0, MAX_LEN), answer: a.slice(0, MAX_LEN) });
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
        `INSERT INTO flashcards (question, answer, node_id, node_name, document_id, block_id, next_review)
         VALUES ($1, $2, $3, $4, $5, $6, NULL)
         ON CONFLICT (document_id, block_id) DO UPDATE
           SET question = EXCLUDED.question, answer = EXCLUDED.answer,
               node_id = EXCLUDED.node_id, node_name = EXCLUDED.node_name
         WHERE flashcards.question IS DISTINCT FROM EXCLUDED.question
            OR flashcards.answer IS DISTINCT FROM EXCLUDED.answer
            OR flashcards.node_id IS DISTINCT FROM EXCLUDED.node_id`,
        [c.question, c.answer, doc.node_id, nodeName, doc.id, c.blockId],
      );
    }
    const removed = await this.db.query(
      `DELETE FROM flashcards WHERE document_id = $1 AND NOT (block_id = ANY($2::text[]))`,
      [doc.id, cards.map(c => c.blockId)],
    );
    if (removed.rowCount) this.logger.log(`Doc ${doc.id}: ${removed.rowCount} flashcard(s) removed`);
  }
}