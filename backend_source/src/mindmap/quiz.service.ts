// ============================================================
// 🧪 QUESTION GENERATOR - questions, answers, and what they show
// ============================================================
// Questions live in the "flashcards" table (so spaced repetition,
// decks and the cards written in Docs all keep working), with:
//   kind       recall | numeric | explain | choice
//   lle_level  1 Meaning · 2 Procedure · 3 Connection · 4 Judgment · 5 Creation
//   lle_rep    verbal · graphical · concrete · symbolic · procedural · structural · intuitive
//   spec       format details:
//                numeric  { variables: [{name,min,max,step,decimals,unit,values,expr}],
//                           formula, tolerancePct, unit }
//                choice   { choices: [{text, correct, why}] }
//                explain  { checklist: ["…", "…"] }
//   solution   worked solution shown after answering (numeric: {m}, {answer} filled in)
// Numbers are made and checked in the browser (frontend lib/quizMath.ts).
//
// quiz_reviews     every answer: rating, right/wrong, and — when missed —
//                  which mechanism failed (meaning / procedure / connection /
//                  judgment / creation / slip). Feeds the LLE chart.
// quiz_reflections Level-4 synthesis answers from the end of sessions.
// ============================================================

import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export const KINDS = ['recall', 'numeric', 'explain', 'choice'];
export const REPS = ['verbal', 'graphical', 'concrete', 'symbolic', 'procedural', 'structural', 'intuitive'];
export const MECHANISMS = ['meaning', 'procedure', 'connection', 'judgment', 'creation', 'slip'];

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const toId = (v: any) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };

@Injectable()
export class QuizService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  // Check and tidy what the editor sent
  private clean(b: any, partial: boolean) {
    const out: Record<string, any> = {};
    if (b.kind !== undefined || !partial) {
      const kind = String(b.kind || 'recall');
      if (!KINDS.includes(kind)) throw new BadRequestException(`Format must be one of: ${KINDS.join(', ')}`);
      out.kind = kind;
    }
    if (b.question !== undefined || !partial) {
      const q = String(b.question ?? '').trim();
      if (!q) throw new BadRequestException('Write the question');
      out.question = q.slice(0, 5000);
    }
    if (b.answer !== undefined || !partial) {
      const a = String(b.answer ?? '').trim();
      if (!a) throw new BadRequestException('Write the answer (for numeric questions: the formula)');
      out.answer = a.slice(0, 10000);
    }
    if (b.lleLevel !== undefined) {
      const l = b.lleLevel == null || b.lleLevel === '' ? null : Number(b.lleLevel);
      if (l !== null && !(Number.isInteger(l) && l >= 1 && l <= 5)) throw new BadRequestException('LLE level is 1–5');
      out.lle_level = l;
    }
    if (b.lleRep !== undefined) {
      const r = b.lleRep == null || b.lleRep === '' ? null : String(b.lleRep);
      if (r !== null && !REPS.includes(r)) throw new BadRequestException(`Representation must be one of: ${REPS.join(', ')}`);
      out.lle_rep = r;
    }
    if (b.spec !== undefined) {
      const spec = b.spec && typeof b.spec === 'object' ? b.spec : {};
      const kind = out.kind ?? b.kind;
      if (kind === 'numeric') {
        if (!Array.isArray(spec.variables)) throw new BadRequestException('Numeric questions need their variables');
        if (!String(spec.formula || '').trim()) throw new BadRequestException('Numeric questions need the answer formula');
      }
      if (kind === 'choice') {
        const choices = Array.isArray(spec.choices) ? spec.choices.filter((c: any) => String(c?.text || '').trim()) : [];
        if (choices.length < 2) throw new BadRequestException('Give at least two choices');
        if (!choices.some((c: any) => c.correct)) throw new BadRequestException('Mark the correct choice');
        spec.choices = choices;
      }
      out.spec = JSON.stringify(spec);
    }
    if (b.solution !== undefined) out.solution = b.solution ? String(b.solution).slice(0, 10000) : null;
    if (b.difficulty !== undefined) out.difficulty = ['easy', 'medium', 'hard'].includes(b.difficulty) ? b.difficulty : 'medium';
    if (b.nodeId !== undefined) out.node_id = toId(b.nodeId);
    if (b.nodeName !== undefined) out.node_name = b.nodeName ? String(b.nodeName) : null;
    return out;
  }

  async createQuestion(b: any) {
    const f = this.clean(b, false);
    f.next_review = today();
    const keys = Object.keys(f);
    const res = await this.db.query(
      `INSERT INTO flashcards (${keys.join(', ')}) VALUES (${keys.map((_, i) => (keys[i] === 'spec' ? `$${i + 1}::jsonb` : `$${i + 1}`)).join(', ')}) RETURNING *`,
      keys.map(k => f[k]),
    );
    return res.rows[0];
  }

  async updateQuestion(id: number, b: any) {
    const card = (await this.db.query('SELECT id, document_id FROM flashcards WHERE id = $1', [id])).rows[0];
    if (!card) throw new NotFoundException('No such question');
    const f = this.clean(b, true);
    // Cards written in a Doc keep their text from the Doc (edit them there); their format and LLE tag can change here
    if (card.document_id != null) { delete f.question; delete f.answer; delete f.node_id; delete f.node_name; }
    const keys = Object.keys(f);
    if (!keys.length) throw new BadRequestException('Nothing to change');
    const res = await this.db.query(
      `UPDATE flashcards SET ${keys.map((k, i) => `${k} = $${i + 2}${k === 'spec' ? '::jsonb' : ''}`).join(', ')} WHERE id = $1 RETURNING *`,
      [id, ...keys.map(k => f[k])],
    );
    return res.rows[0];
  }

  // ------------------------------------------------------------
  async logReview(b: any) {
    const cardId = toId(b.cardId);
    if (!cardId) throw new BadRequestException('Which question?');
    const card = (await this.db.query('SELECT id, node_id, lle_level, lle_rep FROM flashcards WHERE id = $1', [cardId])).rows[0];
    if (!card) throw new NotFoundException('No such question');
    const mechanism = b.mechanism && MECHANISMS.includes(b.mechanism) ? b.mechanism : null;
    const rating = Number(b.rating);
    await this.db.query(
      `INSERT INTO quiz_reviews (card_id, node_id, rating, correct, mechanism, lle_level, lle_rep, seconds, response)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [cardId, card.node_id, rating >= 1 && rating <= 4 ? rating : null,
       typeof b.correct === 'boolean' ? b.correct : rating >= 3,
       mechanism, card.lle_level, card.lle_rep,
       Number.isFinite(Number(b.seconds)) ? Math.round(Number(b.seconds)) : null,
       b.response ? String(b.response).slice(0, 5000) : null],
    );
    return { success: true };
  }

  // ------------------------------------------------------------
  // LLE CHART for some nodes: questions per cell, accuracy per cell, what fails
  async coverage(nodeIdsRaw: string | undefined, days = 90) {
    const ids = String(nodeIdsRaw || '').split(',').map(toId).filter((n): n is number => !!n);
    const where = ids.length ? 'node_id = ANY($1::int[])' : 'TRUE';
    const params = ids.length ? [ids] : [];
    const [cells, acc, mech, untagged] = await Promise.all([
      this.db.query(`SELECT lle_level AS level, lle_rep AS rep, kind, COUNT(*)::int AS n FROM flashcards
                     WHERE ${where} AND lle_level IS NOT NULL GROUP BY 1, 2, 3`, params),
      this.db.query(`SELECT lle_level AS level, lle_rep AS rep, COUNT(*)::int AS answered, SUM(CASE WHEN correct THEN 1 ELSE 0 END)::int AS right
                     FROM quiz_reviews WHERE ${where} AND lle_level IS NOT NULL AND reviewed_at > NOW() - INTERVAL '${days} days'
                     GROUP BY 1, 2`, params),
      this.db.query(`SELECT mechanism, COUNT(*)::int AS n FROM quiz_reviews
                     WHERE ${where} AND mechanism IS NOT NULL AND reviewed_at > NOW() - INTERVAL '30 days'
                     GROUP BY 1 ORDER BY 2 DESC`, params),
      this.db.query(`SELECT COUNT(*)::int AS n FROM flashcards WHERE ${where} AND lle_level IS NULL`, params),
    ]);
    return { cells: cells.rows, accuracy: acc.rows, mechanisms: mech.rows, untagged: untagged.rows[0]?.n || 0 };
  }

  // ------------------------------------------------------------
  async saveReflection(b: any) {
    const prompt = String(b.prompt || '').trim(), response = String(b.response || '').trim();
    if (!prompt || !response) throw new BadRequestException('Write your answer first');
    const nodeIds = (Array.isArray(b.nodeIds) ? b.nodeIds : []).map(toId).filter((n: any) => n);
    const res = await this.db.query(
      'INSERT INTO quiz_reflections (node_ids, prompt, response) VALUES ($1::int[], $2, $3) RETURNING *',
      [nodeIds, prompt.slice(0, 2000), response.slice(0, 20000)],
    );
       return res.rows[0];
  }

  // ------------------------------------------------------------
  // 📤 EXPORT FOR AI ANALYSIS: every answer with its question, plus the
  // questions themselves, coverage and synthesis answers — for some nodes
  // (all if none) over the last N days. The Quiz Center turns it into a
  // Markdown report to paste into an AI chat or download.
  async exportData(nodeIdsRaw: string | undefined, daysRaw: any) {
    const ids = String(nodeIdsRaw || '').split(',').map(toId).filter((n): n is number => !!n);
    const days = Math.min(3650, Math.max(1, Math.round(Number(daysRaw) || 30)));
    const scope = ids.length ? 'AND r.node_id = ANY($1::int[])' : '';
    const params: any[] = ids.length ? [ids] : [];
    const [reviews, questions, reflections, coverage] = await Promise.all([
      this.db.query(
        `SELECT r.reviewed_at, r.rating, r.correct, r.mechanism, r.seconds, r.response,
                r.lle_level, r.lle_rep, f.id AS question_id, f.kind, f.question, f.answer, f.spec,
                COALESCE(n.name, f.node_name) AS node
         FROM quiz_reviews r
         JOIN flashcards f ON f.id = r.card_id
         LEFT JOIN mindmap_nodes n ON n.id = r.node_id
         WHERE r.reviewed_at > NOW() - INTERVAL '${days} days' ${scope}
         ORDER BY r.reviewed_at
         LIMIT 3000`, params),
      this.db.query(
        `SELECT f.id, f.kind, f.question, f.lle_level, f.lle_rep, f.interval_days, f.ease_factor, f.review_count,
                f.next_review, COALESCE(n.name, f.node_name) AS node
         FROM flashcards f LEFT JOIN mindmap_nodes n ON n.id = f.node_id
         ${ids.length ? 'WHERE f.node_id = ANY($1::int[])' : ''}
         ORDER BY node, f.id
         LIMIT 3000`, params),
      this.db.query(
        `SELECT created_at, prompt, response FROM quiz_reflections
         WHERE created_at > NOW() - INTERVAL '${days} days' ${ids.length ? 'AND node_ids && $1::int[]' : ''}
         ORDER BY created_at`, params),
      this.coverage(ids.join(','), days),
    ]);
       return { days, nodeIds: ids, reviews: reviews.rows, questions: questions.rows, reflections: reflections.rows, coverage };
  }

  // ------------------------------------------------------------
  // 🗓 DAILY REVIEW settings: how many never-seen questions to add a day,
  // and the minimum to answer a day (topped up with your weakest ones).
  async settings() {
    const row = (await this.db.query(`SELECT value FROM app_settings WHERE key = 'quiz'`)).rows[0];
    return { newPerDay: 30, dailyMinimum: 30, ...(row?.value || {}) };
  }

  async saveSettings(b: any) {
    const clamp = (v: any, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(500, Math.max(0, n)) : d; };
    const cur = await this.settings();
    const value = { newPerDay: clamp(b.newPerDay ?? cur.newPerDay, 30), dailyMinimum: clamp(b.dailyMinimum ?? cur.dailyMinimum, 30) };
    await this.db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('quiz', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(value)],
    );
    return value;
  }

  // Today's progress, in your time zone (the backend's TZ, e.g. America/Chicago):
  //   answeredToday  answers given today
  //   newDoneToday   questions answered for the very first time today
  //   streak         days in a row (up to today) you answered at least the daily minimum
  async daily() {
    const settings = await this.settings();
    const tz = process.env.TZ || 'America/Chicago';
    // reviewed_at is stored in the database's own time zone; turn it into your local day
    const day = `((reviewed_at AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE $1)::date`;
    const today = `(NOW() AT TIME ZONE $1)::date`;
    const [counts, firsts, days] = await Promise.all([
      this.db.query(`SELECT COUNT(*)::int AS n FROM quiz_reviews WHERE ${day} = ${today}`, [tz]),
      this.db.query(
        `SELECT COUNT(*)::int AS n FROM (SELECT card_id, MIN(${day}) AS first FROM quiz_reviews GROUP BY card_id) f
         WHERE f.first = ${today}`, [tz]),
      this.db.query(
        `SELECT to_char(${day}, 'YYYY-MM-DD') AS d, COUNT(*)::int AS n FROM quiz_reviews
         WHERE reviewed_at > NOW() - INTERVAL '400 days' GROUP BY 1 ORDER BY 1 DESC`, [tz]),
    ]);
    const answeredToday = counts.rows[0]?.n || 0;
    const min = Math.max(1, settings.dailyMinimum);
    // Count back from today (or from yesterday if today isn't finished yet)
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const done = new Set(days.rows.filter((r: any) => r.n >= min).map((r: any) => r.d));
    const local = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    const cursor = new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
    if (!done.has(iso(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
    let streak = 0;
    while (done.has(iso(cursor))) { streak++; cursor.setUTCDate(cursor.getUTCDate() - 1); }
    return { settings, answeredToday, newDoneToday: firsts.rows[0]?.n || 0, streak, doneToday: answeredToday >= min };
  }

  async reflections(nodeId?: any) {
    const id = toId(nodeId);
    const res = id
      ? await this.db.query('SELECT * FROM quiz_reflections WHERE $1 = ANY(node_ids) ORDER BY created_at DESC LIMIT 50', [id])
      : await this.db.query('SELECT * FROM quiz_reflections ORDER BY created_at DESC LIMIT 50');
    return res.rows;
  }
}