// ============================================================
// ✨ QUESTIONS FROM YOUR MAP - made from node descriptions, parent
// lines, your link lines and lesson plans (no AI needed)
// ============================================================
// Each possible question has a stable key (e.g. "prereq:12" = "what comes
// before node 12"). Nothing joins your decks on its own:
//   GET  suggestions      the questions you haven't kept or dismissed yet
//   POST keep             → becomes a normal card (spaced repetition, daily
//                           review, LLE chart…) with flashcards.gen_key = its key
//   POST dismiss          → hidden (quiz_dismissed); undo with "restore"
//   POST refresh          kept cards follow the map: when a link, name or
//                         description changes the card's text changes too
//                         (review history kept); when its source is gone, it goes
//
// What gets asked (LLE cell in brackets):
//   desc:N       What is N?                          (description)       [L1 Meaning · Verbal]
//   parts:N      Name the parts / sub-topics of N    (its sub-nodes; not books / lesson plans) [L3 Connection · Structural]
//   parent:N     N belongs under which topic?        (multiple choice)   [L3 Connection · Structural]
//   prereq:N     What should you know before N?      (Prerequisite →N)   [L3 Connection · Structural]
//   leadsto:N    What does N prepare you for?        (N→ Prerequisite)   [L3 Connection · Structural]
//   causes:N     What does N cause / lead to?        (N→ Causes)         [L3 Connection · Verbal]
//   causedby:N   What causes N?                      (Causes →N)         [L3 Connection · Verbal]
//   example:N    Give an example of N                (Example of →N)     [L1 Meaning · Concrete]
//   exampleof:N  N is an example of…?                (multiple choice)   [L1 Meaning · Concrete]
//   rel:L        How is A connected to B?            (any other link with a label) [L3 Connection · Verbal]
//   order:P      Put the lessons of P in order       (🗂 lesson plan)    [L2 Procedure · Procedural]
// ============================================================

import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface GenQuestion {
  key: string;
  source: string;            // what it was made from, shown in the tray
  nodeId: number;
  nodeName: string;
  kind: 'recall' | 'explain' | 'choice';
  question: string;
  answer: string;
  spec: any;
  solution: string | null;
  lleLevel: number;
  lleRep: string;
}

type N = { id: number; name: string; description: string; meta: any };
type L = { id: number; source: number; target: number; label: string; typeName: string };

const MAX = 12;   // longest list a question asks for
const toId = (v: any) => { const n = Number(v); return Number.isInteger(n) && n > 0 ? n : null; };
const listText = (names: string[]) => names.join(', ');
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
// JSON with keys in a fixed order (Postgres JSONB reorders keys, so plain stringify can't compare)
const stable = (v: any): string =>
  Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  : JSON.stringify(v ?? null);
// Same shuffle every time for the same key, so a card's text doesn't change on every refresh
function seeded<T>(arr: T[], seedText: string) {
  let h = 2166136261;
  for (const ch of seedText) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177); const j = Math.abs(h) % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

@Injectable()
export class QuizGenService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  // ------------------------------------------------------------
  // Every question the map can give right now
  async generate(): Promise<GenQuestion[]> {
    const [nodeRows, linkRows] = await Promise.all([
      this.db.query('SELECT id, name, description, metadata FROM mindmap_nodes'),
      this.db.query(`SELECT l.id, l.source_id, l.target_id, COALESCE(l.label, '') AS label, COALESCE(t.name, '') AS type_name
                     FROM node_links l LEFT JOIN link_types t ON t.id = l.type_id`),
    ]);
    const nodes: N[] = nodeRows.rows.map((r: any) => ({
      id: r.id, name: String(r.name || '').trim(), description: String(r.description || '').trim(),
      meta: typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : r.metadata || {},
    })).filter((n: N) => n.name);
    const byId = new Map(nodes.map(n => [n.id, n]));
    const byName = new Map<string, N>();
    for (const n of nodes) if (!byName.has(n.name.toLowerCase())) byName.set(n.name.toLowerCase(), n);
    const children = new Map<number, N[]>();
    const parentOf = new Map<number, N>();
    for (const n of nodes) {
      const p = byName.get(String(n.meta.parent || '').toLowerCase());
      if (!p || p.id === n.id) continue;
      parentOf.set(n.id, p);
      if (!children.has(p.id)) children.set(p.id, []);
      children.get(p.id)!.push(n);
    }
    const links: L[] = linkRows.rows
      .map((r: any) => ({ id: r.id, source: r.source_id, target: r.target_id, label: String(r.label || '').trim(), typeName: String(r.type_name || '') }))
      .filter((l: L) => byId.has(l.source) && byId.has(l.target) && l.source !== l.target);
    const kindOf = (l: L) => {
      const t = l.typeName.toLowerCase();
      return t.includes('prereq') ? 'prereq' : t.includes('cause') ? 'causes' : t.includes('example') ? 'example' : t.includes('goal') ? 'goal' : 'other';
    };
    const into = (kind: string, id: number) => links.filter(l => kindOf(l) === kind && l.target === id).map(l => byId.get(l.source)!);
    const outOf = (kind: string, id: number) => links.filter(l => kindOf(l) === kind && l.source === id).map(l => byId.get(l.target)!);
    const uniq = (list: N[]) => Array.from(new Map(list.map(n => [n.id, n])).values()).sort((a, b) => a.name.localeCompare(b.name));

    const out: GenQuestion[] = [];
    const add = (q: Omit<GenQuestion, 'nodeName' | 'solution'> & { solution?: string | null }) =>
      out.push({ ...q, nodeName: byId.get(q.nodeId)?.name || '', solution: q.solution ?? null });
    // "Name all of these": you write your answer, then tick the ones you got
    const listQuestion = (key: string, source: string, node: N, question: string, intro: string, items: N[], lleLevel: number, lleRep: string) => {
      const names = uniq(items).slice(0, MAX).map(n => n.name);
      add({ key, source, nodeId: node.id, kind: 'explain', question, answer: `${intro} ${listText(names)}.`, spec: { checklist: names }, lleLevel, lleRep });
    };
    // Multiple choice: the right node and up to 3 wrong ones — taken from the first pools first
    // (closest alternatives), never the node itself or anything under it
    const choiceQuestion = (key: string, source: string, node: N, question: string, right: N, pools: N[][], why: string, lleLevel: number, lleRep: string) => {
      const under = descendants(node.id);
      const seen = new Set<number>([right.id, node.id]);
      const wrong: N[] = [];
      for (const pool of pools) {
        for (const p of seeded(uniq(pool), `${key}:${wrong.length}`)) {
          if (wrong.length >= 3) break;
          if (seen.has(p.id) || under.has(p.id)) continue;
          seen.add(p.id); wrong.push(p);
        }
      }
      if (wrong.length < 2) return;   // needs real alternatives to be worth asking
      const choices = seeded([{ text: right.name, correct: true, why }, ...wrong.map(w => ({ text: w.name, correct: false, why: '' }))], `${key}:order`);
      add({ key, source, nodeId: node.id, kind: 'choice', question, answer: right.name, spec: { choices }, lleLevel, lleRep });
    };

    const parents = nodes.filter(n => (children.get(n.id) || []).length > 0);
    // Top of a node's family (its root topic) and everything under a node
    const rootOf = (n: N) => { let r = n; const seenR = new Set<number>(); while (parentOf.get(r.id) && !seenR.has(r.id)) { seenR.add(r.id); r = parentOf.get(r.id)!; } return r; };
    const descendants = (id: number) => {
      const out = new Set<number>(); const queue = [id];
      while (queue.length) for (const c of children.get(queue.shift()!) || []) if (!out.has(c.id)) { out.add(c.id); queue.push(c.id); }
      return out;
    };

    for (const n of nodes) {
      // What is it? (from the description; a bare web address isn't a definition)
      const d = n.description;
      if (d.length >= 15 && !/^https?:\/\/\S+$/i.test(d) && d.toLowerCase() !== n.name.toLowerCase()) {
        add({ key: `desc:${n.id}`, source: 'Description', nodeId: n.id, kind: 'recall',
          question: `What is **${n.name}**?`, answer: d.slice(0, 1500), spec: {}, lleLevel: 1, lleRep: 'verbal' });
      }
      // Its parts (sub-nodes) — not for a lesson plan (it asks for the order) or a book (chapters get their own reviews)
      const kids = children.get(n.id) || [];
      if (kids.length >= 2 && n.meta.role !== 'lessonPlan' && n.meta.role !== 'book') {
        listQuestion(`parts:${n.id}`, 'Sub-nodes', n, `Name the parts / sub-topics of **${n.name}**.`, `${n.name} is made up of:`, kids, 3, 'structural');
      }
      // Where it belongs (parent), choosing among topics near its real parent
      const p = parentOf.get(n.id);
      if (p && n.meta.role !== 'lesson' && n.meta.role !== 'chapter') {   // lessons/chapters: where they belong is obvious
        const grand = parentOf.get(p.id);
        const near = grand ? (children.get(grand.id) || []).filter(x => (children.get(x.id) || []).length > 0) : [];
        const root = rootOf(n);
        const sameSubject = parents.filter(x => x.id === root.id || rootOf(x).id === root.id);
        choiceQuestion(`parent:${n.id}`, 'Parent line', n, `**${n.name}** belongs under which topic?`, p, [near, sameSubject, parents], `${n.name} is filed under ${p.name}.`, 3, 'structural');
      }
      // Prerequisite links
      const before = into('prereq', n.id);
      if (before.length) listQuestion(`prereq:${n.id}`, 'Prerequisite links', n, `What should you understand before **${n.name}**?`, `Before ${n.name}:`, before, 3, 'structural');
      const after = outOf('prereq', n.id);
      if (after.length) listQuestion(`leadsto:${n.id}`, 'Prerequisite links', n, `What does understanding **${n.name}** prepare you for?`, `${n.name} leads on to:`, after, 3, 'structural');
      // Causes links
      const effects = outOf('causes', n.id);
      if (effects.length) listQuestion(`causes:${n.id}`, 'Causes links', n, `What does **${n.name}** cause or lead to?`, `${n.name} causes:`, effects, 3, 'verbal');
      const causes = into('causes', n.id);
      if (causes.length) listQuestion(`causedby:${n.id}`, 'Causes links', n, `What causes **${n.name}**?`, `${n.name} is caused by:`, causes, 3, 'verbal');
      // Example-of links
      const examples = uniq(into('example', n.id));
      if (examples.length) {
        add({ key: `example:${n.id}`, source: 'Example-of links', nodeId: n.id, kind: 'recall',
          question: `Give an example of **${n.name}**.`, answer: `For example: ${listText(examples.slice(0, MAX).map(e => e.name))}.`, spec: {}, lleLevel: 1, lleRep: 'concrete' });
      }
      const ofWhat = outOf('example', n.id);
      if (ofWhat.length === 1) {
        const right = ofWhat[0];
        const siblings = parentOf.get(right.id) ? (children.get(parentOf.get(right.id)!.id) || []) : [];
        const otherExamples = links.filter(l => kindOf(l) === 'example').map(l => byId.get(l.target)!);
        choiceQuestion(`exampleof:${n.id}`, 'Example-of links', n, `**${n.name}** is an example of…`, right, [siblings, otherExamples], `${n.name} is an example of ${right.name}.`, 1, 'concrete');
      }
      // Lesson plan order
      if (n.meta.role === 'lessonPlan') {
        const lessons = kids.filter(k => k.meta.role === 'lesson')
          .sort((a, b) => (Number(a.meta.lesson?.order ?? 9999) - Number(b.meta.lesson?.order ?? 9999)) || a.name.localeCompare(b.name));
        if (lessons.length >= 3) {
          const shown = seeded(lessons.map(l => l.name), `order:${n.id}`);
          add({ key: `order:${n.id}`, source: 'Lesson plan', nodeId: n.id, kind: 'recall',
            question: `Put the lessons of **${n.name}** in order:\n${shown.map(s => `• ${s}`).join('\n')}`,
            answer: lessons.map((l, i) => `${i + 1}. ${l.name}`).join('\n'), spec: {}, lleLevel: 2, lleRep: 'procedural' });
        }
      }
    }

    // Any other link that says how two nodes connect (its label)
    for (const l of links) {
      if (kindOf(l) !== 'other' || !l.label) continue;
      const a = byId.get(l.source)!, b = byId.get(l.target)!;
      add({ key: `rel:${l.id}`, source: `${l.typeName || 'Link'} line`, nodeId: a.id, kind: 'recall',
        question: `How is **${a.name}** connected to **${b.name}**?`, answer: `${a.name} — ${l.label} → ${b.name}`, spec: {}, lleLevel: 3, lleRep: 'verbal' });
    }
    return out;
  }

  private keysOf(raw: any): string[] {
    const keys = (Array.isArray(raw) ? raw : []).map((k: any) => String(k)).filter((k: string) => /^[a-z]+:\d+$/.test(k));
    if (!keys.length) throw new BadRequestException('Which questions?');
    return Array.from(new Set(keys)).slice(0, 1000);
  }

  // ------------------------------------------------------------
  // The tray: questions not kept yet (and, if asked, the dismissed ones), for some nodes or all
  async suggestions(nodeIdsRaw?: string, showDismissed = false) {
    const ids = new Set(String(nodeIdsRaw || '').split(',').map(toId).filter((n): n is number => !!n));
    const [all, kept, dismissed] = await Promise.all([
      this.generate(),
      this.db.query('SELECT gen_key FROM flashcards WHERE gen_key IS NOT NULL'),
      this.db.query('SELECT gen_key FROM quiz_dismissed'),
    ]);
    const keptSet = new Set(kept.rows.map((r: any) => r.gen_key));
    const dismissedSet = new Set(dismissed.rows.map((r: any) => r.gen_key));
    const inScope = all.filter(q => !ids.size || ids.has(q.nodeId)).filter(q => !keptSet.has(q.key));
    return {
      suggestions: inScope.filter(q => !dismissedSet.has(q.key)),
      dismissed: showDismissed ? inScope.filter(q => dismissedSet.has(q.key)) : [],
      dismissedCount: inScope.filter(q => dismissedSet.has(q.key)).length,
    };
  }

  async keep(rawKeys: any) {
    const keys = this.keysOf(rawKeys);
    const wanted = new Map<string, GenQuestion>((await this.generate()).map(q => [q.key, q]));
    let added = 0;
    for (const key of keys) {
      const q = wanted.get(key);
      if (!q) continue;
      const res = await this.db.query(
        `INSERT INTO flashcards (question, answer, node_id, node_name, kind, spec, solution, lle_level, lle_rep, gen_key, next_review)
         SELECT $1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10::text, $11
         WHERE NOT EXISTS (SELECT 1 FROM flashcards WHERE gen_key = $10::text)`,
        [q.question, q.answer, q.nodeId, q.nodeName, q.kind, JSON.stringify(q.spec), q.solution, q.lleLevel, q.lleRep, key, today()],
      );
      added += res.rowCount || 0;
    }
    await this.db.query('DELETE FROM quiz_dismissed WHERE gen_key = ANY($1::text[])', [keys]);
    return { added };
  }

  // Dismiss: hide it from the tray (and take it out of your decks if you had kept it)
  async dismiss(rawKeys: any) {
    const keys = this.keysOf(rawKeys);
    await this.db.query(
      `INSERT INTO quiz_dismissed (gen_key) SELECT unnest($1::text[]) ON CONFLICT (gen_key) DO NOTHING`, [keys]);
    const removed = await this.db.query('DELETE FROM flashcards WHERE gen_key = ANY($1::text[])', [keys]);
    return { dismissed: keys.length, removedCards: removed.rowCount || 0 };
  }

  async restore(rawKeys: any) {
    const keys = this.keysOf(rawKeys);
    await this.db.query('DELETE FROM quiz_dismissed WHERE gen_key = ANY($1::text[])', [keys]);
    return { restored: keys.length };
  }

  // Kept cards follow the map. Your LLE cell, difficulty and review history stay.
  async refresh() {
    const [all, kept] = await Promise.all([
      this.generate(),
      this.db.query('SELECT id, gen_key, question, answer, node_id, kind, spec, solution FROM flashcards WHERE gen_key IS NOT NULL'),
    ]);
    const byKey = new Map<string, GenQuestion>(all.map(q => [q.key, q]));
    let updated = 0; const gone: number[] = [];
    for (const c of kept.rows) {
      const q = byKey.get(c.gen_key);
      if (!q) { gone.push(c.id); continue; }
      const same = c.question === q.question && c.answer === q.answer && c.node_id === q.nodeId && c.kind === q.kind
        && stable(c.spec || {}) === stable(q.spec) && (c.solution ?? null) === q.solution;
      if (same) continue;
      await this.db.query(
        `UPDATE flashcards SET question = $2, answer = $3, node_id = $4, node_name = $5, kind = $6, spec = $7::jsonb, solution = $8 WHERE id = $1`,
        [c.id, q.question, q.answer, q.nodeId, q.nodeName, q.kind, JSON.stringify(q.spec), q.solution],
      );
      updated++;
    }
    if (gone.length) await this.db.query('DELETE FROM flashcards WHERE id = ANY($1::int[])', [gone]);
    return { updated, removed: gone.length };
  }
}