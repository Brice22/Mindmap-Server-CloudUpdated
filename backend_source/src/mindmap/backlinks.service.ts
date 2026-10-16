// ============================================================
// BACKLINKS SERVICE - automatic links between nodes
// ============================================================
// Whenever text is saved anywhere, it is scanned for other nodes:
//   - Docs (BlockNote documents)      source_type 'doc'
//   - Draw notes (Excalidraw text)    source_type 'drawing'
//   - Node descriptions               source_type 'description'
//   - Map pins that point at a node   source_type 'map'
// Two kinds of link:
//   - 'link'    explicit: an @mention in Docs, [[Node Name]] typed
//               anywhere, or a map pin for that node
//   - 'mention' automatic: the node's name — or one of its aliases
//               ("Also known as", e.g. UIUC) — appears in the text
//               (whole words, names of 3+ characters, any case)
// Renaming a node keeps the old name as an alias, so text written
// with the old name stays linked.
// Results live in node_backlinks; each save replaces the rows for
// that one source, so links disappear when the text is removed.
// New or renamed nodes re-check every text that contains the name.
// ============================================================

import { Injectable, Inject, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

type SourceType = 'doc' | 'drawing' | 'description' | 'map';
type Kind = 'link' | 'mention';

interface Target { id: number; name: string; names: string[]; re: RegExp | null }
interface Found { targetId: number; kind: Kind; snippet: string }

const MIN_MENTION_LENGTH = 3;
const SNIPPET_RADIUS = 60;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function snippetAt(text: string, index: number, length: number) {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(text.length, index + length + SNIPPET_RADIUS);
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
}

// ------------------------------------------------------------
// TEXT EXTRACTION
// ------------------------------------------------------------
// BlockNote document → plain text + ids of @mentioned nodes
export function extractDocText(blocks: any[]): { text: string; mentionIds: number[] } {
  const parts: string[] = [];
  const mentionIds: number[] = [];

  const inline = (content: any): string => {
    if (!content) return '';
    if (typeof content === 'string') return content;
    if (!Array.isArray(content)) return '';
    return content.map((ic: any) => {
      if (typeof ic === 'string') return ic;
      if (ic.type === 'text') return ic.text || '';
      if (ic.type === 'link') return inline(ic.content);
      if (ic.type === 'nodeMention') {
        if (ic.props?.nodeId) mentionIds.push(Number(ic.props.nodeId));
        return ic.props?.name || '';
      }
      if (ic.type === 'inlineMath') return ic.props?.latex || '';
      return '';
    }).join('');
  };

  const walk = (list: any[]) => {
    for (const b of list || []) {
      if (!b || typeof b !== 'object') continue;
      if (b.type === 'table' && b.content?.rows) {
        for (const row of b.content.rows) {
          parts.push((row.cells || []).map((c: any) => inline(Array.isArray(c) ? c : c?.content)).join(' | '));
        }
      } else if (b.type === 'chart') {
        parts.push(`${b.props?.title || ''}\n${b.props?.data || ''}`);
      } else {
        const t = inline(b.content);
        if (t) parts.push(t);
        if (b.props?.caption) parts.push(String(b.props.caption));
      }
      if (Array.isArray(b.children) && b.children.length) walk(b.children);
    }
  };
  walk(Array.isArray(blocks) ? blocks : []);
  return { text: parts.join('\n'), mentionIds };
}

// Excalidraw drawing → text from its text boxes
export function extractDrawingText(data: any): string {
  const els = Array.isArray(data?.elements) ? data.elements : [];
  return els
    .filter((el: any) => el && !el.isDeleted && el.type === 'text')
    .map((el: any) => el.originalText || el.text || '')
    .join('\n');
}

@Injectable()
export class BacklinksService {
  private readonly logger = new Logger(BacklinksService.name);

  // Backlink jobs run one at a time, so two quick saves can't interleave
  private queue: Promise<unknown> = Promise.resolve();

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {
    // First start after this feature is added: build links for everything already written
    setTimeout(() => this.enqueue(() => this.buildIfEmpty()), 8000);
  }

  // Run a backlink job in the background; errors are logged, never thrown at the caller
  enqueue(job: () => Promise<unknown>) {
    this.queue = this.queue.then(job).catch(e => this.logger.warn('Backlink update failed: ' + (e?.message || e)));
    return this.queue;
  }

  // ------------------------------------------------------------
  // MATCHING
  // ------------------------------------------------------------
  private async loadTargets(): Promise<Target[]> {
    const res = await this.db.query(`SELECT id, name, metadata->'aliases' AS aliases FROM mindmap_nodes`);
    return res.rows
      .filter((r: any) => r.name && r.name.trim())
      .map((r: any) => {
        const name = String(r.name).trim();
        const aliases = Array.isArray(r.aliases) ? r.aliases.map((a: any) => String(a).trim()).filter(Boolean) : [];
        const names = [...new Set([name, ...aliases])];
        // Whole-word, case-insensitive; very short names only link when explicit. Longest first.
        const auto = names.filter(n => n.length >= MIN_MENTION_LENGTH).sort((a, b) => b.length - a.length);
        return {
          id: r.id,
          name,
          names: names.map(n => n.toLowerCase()),
          re: auto.length
            ? new RegExp(`(^|[^\\p{L}\\p{N}_])(${auto.map(escapeRegExp).join('|')})(?=$|[^\\p{L}\\p{N}_])`, 'iu')
            : null,
        };
      });
  }

  private findLinks(text: string, explicitIds: number[], targets: Target[], excludeNodeId: number | null): Found[] {
    const found = new Map<number, Found>();
    const byId = new Map(targets.map(t => [t.id, t]));
    const byName = new Map<string, Target>();
    for (const t of targets) for (const n of t.names) if (!byName.has(n)) byName.set(n, t);

    // Explicit: @mentions and [[Node Name]]
    const explicit = new Set<number>(explicitIds);
    for (const m of text.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
      const t = byName.get(m[1].trim().toLowerCase());
      if (t) explicit.add(t.id);
    }
    for (const id of explicit) {
      const t = byId.get(id);
      if (!t || t.id === excludeNodeId) continue;
      const lower = text.toLowerCase();
      const hit = t.names.map(n => ({ n, i: lower.indexOf(n) })).find(h => h.i >= 0);
      found.set(t.id, { targetId: t.id, kind: 'link', snippet: hit ? snippetAt(text, hit.i, hit.n.length) : '' });
    }

    // Automatic: the node's name appears in the text
    for (const t of targets) {
      if (!t.re || t.id === excludeNodeId || found.has(t.id)) continue;
      const m = t.re.exec(text);
      if (m) {
        const index = m.index + m[1].length;
        found.set(t.id, { targetId: t.id, kind: 'mention', snippet: snippetAt(text, index, m[2].length) });
      }
    }
    return [...found.values()];
  }

  // Replace all rows for one source with a fresh set
  private async replaceSource(type: SourceType, sourceId: number, sourceNodeId: number | null, found: Found[]) {
    await this.db.query('DELETE FROM node_backlinks WHERE source_type = $1 AND source_id = $2', [type, sourceId]);
    if (found.length === 0) return;
    const values: any[] = [];
    const rows = found.map((f, i) => {
      values.push(f.targetId, type, sourceId, sourceNodeId, f.kind, f.snippet.slice(0, 400));
      const o = i * 6;
      return `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6})`;
    });
    await this.db.query(
      `INSERT INTO node_backlinks (target_node_id, source_type, source_id, source_node_id, kind, snippet)
       VALUES ${rows.join(', ')}`,
      values,
    );
  }

  // ------------------------------------------------------------
  // REINDEX ONE SOURCE
  // ------------------------------------------------------------
  async reindexDocument(docId: number, targets?: Target[]) {
    const res = await this.db.query('SELECT id, node_id, title, content FROM node_documents WHERE id = $1', [docId]);
    const doc = res.rows[0];
    if (!doc) return this.removeDocument(docId);
    const { text, mentionIds } = extractDocText(doc.content);
    const all = targets || await this.loadTargets();
    await this.replaceSource('doc', doc.id, doc.node_id, this.findLinks(`${doc.title}\n${text}`, mentionIds, all, doc.node_id));
  }

  // A node's own description, Draw notes and map pins
  async reindexNode(nodeId: number, targets?: Target[]) {
    const res = await this.db.query('SELECT id, description, metadata FROM mindmap_nodes WHERE id = $1', [nodeId]);
    const node = res.rows[0];
    if (!node) return this.afterNodeDeleted(nodeId);
    const meta = typeof node.metadata === 'string' ? JSON.parse(node.metadata || '{}') : node.metadata || {};
    const all = targets || await this.loadTargets();

    await this.replaceSource('description', node.id, node.id, this.findLinks(node.description || '', [], all, node.id));
    await this.replaceSource('drawing', node.id, node.id, this.findLinks(extractDrawingText(meta.excalidrawData), [], all, node.id));

    // Map pins placed for other nodes count as explicit links
    const pins: Found[] = [];
    const seen = new Set<number>();
    for (const m of Array.isArray(meta.mapMarkers) ? meta.mapMarkers : []) {
      const id = Number(m?.nodeId);
      if (!id || id === node.id || seen.has(id) || !all.some(t => t.id === id)) continue;
      seen.add(id);
      pins.push({ targetId: id, kind: 'link', snippet: `📍 ${Number(m.lat).toFixed(4)}, ${Number(m.lng).toFixed(4)}` });
    }
    await this.replaceSource('map', node.id, node.id, pins);
  }

  // ------------------------------------------------------------
  // HOOKS (called by MindmapService)
  // ------------------------------------------------------------
  async afterNodeSaved(newRow: any, oldRow: any | null) {
    const oldMeta = oldRow ? (typeof oldRow.metadata === 'string' ? JSON.parse(oldRow.metadata || '{}') : oldRow.metadata || {}) : {};
    const newMeta = typeof newRow.metadata === 'string' ? JSON.parse(newRow.metadata || '{}') : newRow.metadata || {};
    const nameChanged = !oldRow || oldRow.name !== newRow.name;
    const textChanged = !oldRow
      || oldRow.description !== newRow.description
      || JSON.stringify(oldMeta.excalidrawData || null) !== JSON.stringify(newMeta.excalidrawData || null)
      || JSON.stringify(oldMeta.mapMarkers || null) !== JSON.stringify(newMeta.mapMarkers || null);
    const aliasesChanged = JSON.stringify(oldMeta.aliases || []) !== JSON.stringify(newMeta.aliases || []);
    // Moving a node on the graph changes none of these — nothing to do
    if (!nameChanged && !textChanged && !aliasesChanged) return;

    // Renamed: keep the old name as an alias so text that uses it stays linked
    if (oldRow && nameChanged && oldRow.name && oldRow.name.trim().toLowerCase() !== String(newRow.name).trim().toLowerCase()) {
      const aliases: string[] = Array.isArray(newMeta.aliases) ? newMeta.aliases : [];
      if (!aliases.some(a => String(a).toLowerCase() === oldRow.name.trim().toLowerCase())) {
        await this.db.query(
          `UPDATE mindmap_nodes SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{aliases}', $2::jsonb) WHERE id = $1`,
          [newRow.id, JSON.stringify([...aliases, oldRow.name.trim()])],
        );
      }
    }

    const targets = await this.loadTargets();
    if (textChanged || nameChanged) await this.reindexNode(newRow.id, targets);
    if (nameChanged || aliasesChanged) {
      const names = [newRow.name, ...(Array.isArray(newMeta.aliases) ? newMeta.aliases : [])];
      await this.recheckTextsMentioning(newRow.id, names, targets);
    }
  }

  // A node was created, renamed or given aliases: re-scan every text that links
  // to it now, or that contains one of its names
  private async recheckTextsMentioning(nodeId: number, names: string[], targets: Target[]) {
    const likes = [...new Set(names.map(n => String(n).trim()).filter(Boolean))].map(n => `%${n}%`);
    const docs = await this.db.query(
      `SELECT DISTINCT source_id AS id FROM node_backlinks WHERE target_node_id = $1 AND source_type = 'doc'
       UNION
       SELECT id FROM node_documents WHERE content::text ILIKE ANY($2) OR title ILIKE ANY($2)`,
      [nodeId, likes],
    );
    for (const d of docs.rows) await this.reindexDocument(d.id, targets);

    const nodes = await this.db.query(
      `SELECT DISTINCT source_id AS id FROM node_backlinks
         WHERE target_node_id = $1 AND source_type IN ('description', 'drawing', 'map')
       UNION
       SELECT id FROM mindmap_nodes
         WHERE id <> $1 AND (description ILIKE ANY($2) OR (metadata->'excalidrawData')::text ILIKE ANY($2))`,
      [nodeId, likes],
    );
    for (const n of nodes.rows) await this.reindexNode(n.id, targets);
  }

  async afterNodeDeleted(nodeId: number) {
    // Links *to* the node are removed by the foreign key; remove links *from* its own text
    await this.db.query(
      `DELETE FROM node_backlinks WHERE source_type IN ('description', 'drawing', 'map') AND source_id = $1`,
      [nodeId],
    );
  }

  async removeDocument(docId: number) {
    await this.db.query(`DELETE FROM node_backlinks WHERE source_type = 'doc' AND source_id = $1`, [docId]);
  }

  // ------------------------------------------------------------
  // FULL REBUILD
  // ------------------------------------------------------------
  async reindexAll() {
    const targets = await this.loadTargets();
    const docs = await this.db.query('SELECT id FROM node_documents');
    for (const d of docs.rows) await this.reindexDocument(d.id, targets);
    for (const t of targets) await this.reindexNode(t.id, targets);
    this.logger.log(`Backlinks rebuilt: ${docs.rows.length} documents, ${targets.length} nodes`);
    return { documents: docs.rows.length, nodes: targets.length };
  }

  private async buildIfEmpty() {
    const res = await this.db.query('SELECT EXISTS (SELECT 1 FROM node_backlinks) AS has');
    if (!res.rows[0]?.has) await this.reindexAll();
  }

  // ------------------------------------------------------------
  // READ
  // ------------------------------------------------------------
  async getBacklinks(nodeId: number) {
    const res = await this.db.query(
      `SELECT b.kind, b.source_type, b.source_id, b.source_node_id, b.snippet,
              sn.name AS source_node_name, d.title AS doc_title
       FROM node_backlinks b
       LEFT JOIN mindmap_nodes sn ON sn.id = b.source_node_id
       LEFT JOIN node_documents d ON b.source_type = 'doc' AND d.id = b.source_id
       WHERE b.target_node_id = $1
       ORDER BY (b.kind = 'link') DESC, b.created_at DESC`,
      [nodeId],
    );
    return res.rows;
  }

  // Node-to-node pairs for drawing link lines on the graph
  async getEdges() {
    const res = await this.db.query(
      `SELECT source_node_id AS source, target_node_id AS target,
              CASE WHEN bool_or(kind = 'link') THEN 'link' ELSE 'mention' END AS kind
       FROM node_backlinks
       WHERE source_node_id IS NOT NULL AND source_node_id <> target_node_id
       GROUP BY source_node_id, target_node_id`,
    );
    return res.rows;
  }
}