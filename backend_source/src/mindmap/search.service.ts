// ============================================================
// SEARCH SERVICE - one search over nodes, documents and files
// ============================================================
// MeiliSearch index "hserver" holds:
//   node_<id>          name, description, aliases, Draw notes text
//   doc_<id>           document title + text
//   file_<id>_<page>   one entry per PDF page / slide / sheet / part
//                      (page 0 = just the file name)
// "group" makes a file show up once, at its best page.
// Kept up to date automatically: every save already goes through the
// backlinks job (nodes, docs) or the file reader (files), which call
// this service. Empty index at startup → everything is added.
// If MeiliSearch isn't running (e.g. on the laptop) search still works
// from PostgreSQL — slower and without typo tolerance.
// Matches come back marked with \u0001 … \u0002 (the app highlights them).
// Settings: MEILI_HOST (default http://meilisearch:7700), MEILI_MASTER_KEY
// ============================================================

import { Injectable, Inject, Logger } from '@nestjs/common';
import { MeiliSearch } from 'meilisearch';
import { DatabaseService } from '../database/database.service';

const INDEX = 'hserver';
const MARK_START = '\u0001';
const MARK_END = '\u0002';
const DOC_TEXT_LIMIT = 100_000;
const PAGE_TEXT_LIMIT = 20_000;

export interface SearchHit {
  kind: 'node' | 'doc' | 'file';
  refId: number;
  title: string;
  snippet: string;
  nodeId: number | null;
  nodeName: string | null;
  page?: number | null;
  path?: string | null;
  mime?: string | null;
  sourceUrl?: string | null;
  documentId?: number | null;
}

type Extractors = {
  doc?: (blocks: any[]) => { text: string };
  drawing?: (data: any) => string;
};

const metaOf = (row: any) => (typeof row?.metadata === 'string' ? JSON.parse(row.metadata || '{}') : row?.metadata || {});

// Plain-text snippet around the first match, with the match marked
function markedSnippet(text: string, q: string, radius = 90): string {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  const at = clean.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return clean.slice(0, radius * 2) + (clean.length > radius * 2 ? '…' : '');
  const start = Math.max(0, at - radius);
  const end = Math.min(clean.length, at + q.length + radius);
  return (start > 0 ? '…' : '') + clean.slice(start, at) + MARK_START + clean.slice(at, at + q.length) + MARK_END
    + clean.slice(at + q.length, end) + (end < clean.length ? '…' : '');
}

const markTitle = (title: string, q: string) => {
  const at = title.toLowerCase().indexOf(q.toLowerCase());
  return at < 0 ? title : title.slice(0, at) + MARK_START + title.slice(at, at + q.length) + MARK_END + title.slice(at + q.length);
};

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly meili = new MeiliSearch({
    host: process.env.MEILI_HOST || 'http://meilisearch:7700',
    apiKey: process.env.MEILI_MASTER_KEY || 'masterKey',
    timeout: 5000,
  } as any);
  private upUntil = 0;       // MeiliSearch answered recently
  private downUntil = 0;     // MeiliSearch didn't answer — don't ask again for a minute
  private extract: Extractors = {};

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {
    setTimeout(() => this.ensureReady().catch(e => this.logger.warn('Search setup: ' + (e?.message || e))), 12_000);
  }

  // The backlinks service hands over its text readers (avoids a circular import)
  setExtractors(e: Extractors) { this.extract = e; }

  private async available(): Promise<boolean> {
    const now = Date.now();
    if (now < this.upUntil) return true;
    if (now < this.downUntil) return false;
    try {
      await this.meili.health();
      this.upUntil = now + 30_000;
      return true;
    } catch {
      if (!this.downUntil) this.logger.warn('MeiliSearch not reachable — searching PostgreSQL instead');
      this.downUntil = now + 60_000;
      return false;
    }
  }

  private index() { return this.meili.index(INDEX); }

  async ensureReady() {
    if (!(await this.available())) return;
    try { await this.meili.createIndex(INDEX, { primaryKey: 'id' }); } catch {}
        // An index made by an early save has no primary key, and Meilisearch can't pick one (id, refId,
    // nodeId…), so every addition fails → set it (only allowed while the index is empty)
    const info: any = await this.index().getRawInfo().catch(() => null);
    if (info && !info.primaryKey) await this.index().update({ primaryKey: 'id' }).catch(() => {});
    await this.index().updateSettings({
      searchableAttributes: ['title', 'text', 'nodeName'],
      filterableAttributes: ['kind', 'refId', 'nodeId'],
      distinctAttribute: 'group',
    });
    const stats: any = await this.index().getStats().catch(() => null);
    if (!stats?.numberOfDocuments) await this.reindexAll();
  }

  status() {
    return this.available().then(async up => ({
      engine: up ? 'meilisearch' : 'postgres',
      documents: up ? ((await this.index().getStats().catch(() => null)) as any)?.numberOfDocuments ?? null : null,
    }));
  }

  // ------------------------------------------------------------
  // KEEP THE INDEX UP TO DATE (errors are logged, never thrown)
  // ------------------------------------------------------------
  private async push(docs: any[]) {
    if (!docs.length || !(await this.available())) return;
    try { await this.index().addDocuments(docs, { primaryKey: 'id' }); } catch (e: any) { this.logger.warn('Search update failed: ' + e?.message); }
  }

  private async drop(fn: () => Promise<any>) {
    if (!(await this.available())) return;
    try { await fn(); } catch (e: any) { this.logger.warn('Search delete failed: ' + e?.message); }
  }

  private nodeDoc(row: any) {
    const meta = metaOf(row);
    const aliases = Array.isArray(meta.aliases) ? meta.aliases.join(', ') : '';
    const drawing = this.extract.drawing ? this.extract.drawing(meta.excalidrawData) : '';
    return {
      id: `node_${row.id}`, group: `node_${row.id}`, kind: 'node', refId: row.id,
      title: row.name, text: [row.description || '', aliases, drawing].filter(Boolean).join('\n').slice(0, DOC_TEXT_LIMIT),
      nodeId: row.id, nodeName: row.name,
    };
  }

  async indexNode(row: any) { if (row) await this.push([this.nodeDoc(row)]); }
  async removeNode(id: number) { await this.drop(() => this.index().deleteDocument(`node_${id}`)); }

  private async docDoc(doc: any, text?: string) {
    const nodeName = doc.node_id
      ? (await this.db.query('SELECT name FROM mindmap_nodes WHERE id = $1', [doc.node_id])).rows[0]?.name ?? null
      : null;
    const body = text ?? (this.extract.doc ? this.extract.doc(doc.content).text : '');
    return {
      id: `doc_${doc.id}`, group: `doc_${doc.id}`, kind: 'doc', refId: doc.id,
      title: doc.title, text: String(body).slice(0, DOC_TEXT_LIMIT), nodeId: doc.node_id ?? null, nodeName,
    };
  }

  // doc = node_documents row (id, node_id, title, content); text = already-extracted text if the caller has it
  async indexDocument(doc: any, text?: string) { if (doc) await this.push([await this.docDoc(doc, text)]); }
  async removeDocument(id: number) { await this.drop(() => this.index().deleteDocument(`doc_${id}`)); }

  private async fileDocs(fileId: number) {
    const f = (await this.db.query(
      `SELECT f.*, n.name AS node_name FROM files f LEFT JOIN mindmap_nodes n ON n.id = f.node_id WHERE f.id = $1`, [fileId],
    )).rows[0];
    if (!f) return [];
    const base = {
      group: `file_${f.id}`, kind: 'file', refId: f.id, title: f.name, nodeId: f.node_id ?? null, nodeName: f.node_name ?? null,
      path: f.path, mime: f.mime, sourceUrl: f.source_url, documentId: f.document_id,
    };
    const pages = (await this.db.query('SELECT page, text FROM file_texts WHERE file_id = $1 ORDER BY page', [f.id])).rows;
    return [
      { ...base, id: `file_${f.id}_0`, page: null, text: '' },
      ...pages.map((p: any) => ({ ...base, id: `file_${f.id}_${p.page}`, page: p.page, text: String(p.text).slice(0, PAGE_TEXT_LIMIT) })),
    ];
  }

  async indexFile(fileId: number) {
    await this.removeFile(fileId);
    await this.push(await this.fileDocs(fileId));
  }
  async removeFile(fileId: number) {
    await this.drop(() => this.index().deleteDocuments({ filter: `kind = "file" AND refId = ${Number(fileId)}` } as any));
  }

  // Everything, from scratch (startup with an empty index, or "Rebuild search")
  async reindexAll() {
    if (!(await this.available())) return { engine: 'postgres', documents: 0 };
    await this.index().deleteAllDocuments().catch(() => {});
    let count = 0;
    const nodes = (await this.db.query('SELECT id, name, description, metadata FROM mindmap_nodes')).rows;
    for (let i = 0; i < nodes.length; i += 500) { await this.push(nodes.slice(i, i + 500).map(n => this.nodeDoc(n))); }
    count += nodes.length;
    const docs = (await this.db.query('SELECT id, node_id, title, content FROM node_documents')).rows;
    const docBatch: any[] = [];
    for (const d of docs) docBatch.push(await this.docDoc(d));
    for (let i = 0; i < docBatch.length; i += 200) await this.push(docBatch.slice(i, i + 200));
    count += docs.length;
    const files = (await this.db.query('SELECT id FROM files')).rows;
    for (const f of files) { const d = await this.fileDocs(f.id); await this.push(d); count += d.length; }
    this.logger.log(`Search index rebuilt: ${nodes.length} nodes, ${docs.length} docs, ${files.length} files`);
    return { engine: 'meilisearch', documents: count };
  }

  // ------------------------------------------------------------
  // SEARCH
  // ------------------------------------------------------------
  async search(q: string, opts: { kind?: string; nodeId?: number; limit?: number } = {}): Promise<{ engine: string; hits: SearchHit[] }> {
    const query = String(q || '').trim();
    if (!query) return { engine: 'none', hits: [] };
    const limit = Math.min(Number(opts.limit) || 30, 100);

    if (await this.available()) {
      try {
        const filter: string[] = [];
        if (opts.kind && ['node', 'doc', 'file'].includes(opts.kind)) filter.push(`kind = "${opts.kind}"`);
        if (opts.nodeId) filter.push(`nodeId = ${Number(opts.nodeId)}`);
        const res: any = await this.index().search(query, {
          limit,
          filter: filter.length ? filter.join(' AND ') : undefined,
          // the full text isn't sent back, only the cropped part around the match
          attributesToRetrieve: ['kind', 'refId', 'title', 'nodeId', 'nodeName', 'page', 'path', 'mime', 'sourceUrl', 'documentId'],
          attributesToCrop: ['text'],
          cropLength: 28,
          attributesToHighlight: ['title', 'text'],
          highlightPreTag: MARK_START,
          highlightPostTag: MARK_END,
        } as any);
        return {
          engine: 'meilisearch',
          hits: res.hits.map((h: any) => ({
            kind: h.kind, refId: h.refId,
            title: h._formatted?.title || h.title,
            snippet: (h._formatted?.text || '').replace(/\s+/g, ' ').trim(),
            nodeId: h.nodeId ?? null, nodeName: h.nodeName ?? null,
            page: h.page ?? null, path: h.path ?? null, mime: h.mime ?? null,
            sourceUrl: h.sourceUrl ?? null, documentId: h.documentId ?? null,
          })),
        };
      } catch (e: any) {
        this.logger.warn('MeiliSearch search failed, using PostgreSQL: ' + e?.message);
      }
    }
    return { engine: 'postgres', hits: await this.searchPostgres(query, opts, limit) };
  }

  private async searchPostgres(q: string, opts: { kind?: string; nodeId?: number }, limit: number): Promise<SearchHit[]> {
    const like = `%${q.replace(/[\\%_]/g, m => '\\' + m)}%`;
    const hits: SearchHit[] = [];
    const want = (k: string) => !opts.kind || opts.kind === k;
    const nodeFilter = (col: string) => (opts.nodeId ? ` AND ${col} = ${Number(opts.nodeId)}` : '');

    if (want('node')) {
      const rows = (await this.db.query(
        `SELECT id, name, description FROM mindmap_nodes
         WHERE (name ILIKE $1 OR description ILIKE $1 OR (metadata->'aliases')::text ILIKE $1)${nodeFilter('id')}
         ORDER BY (name ILIKE $1) DESC, name LIMIT 10`, [like],
      )).rows;
      for (const r of rows) hits.push({ kind: 'node', refId: r.id, title: markTitle(r.name, q), snippet: markedSnippet(r.description || '', q), nodeId: r.id, nodeName: r.name });
    }
    if (want('doc')) {
      const rows = (await this.db.query(
        `SELECT d.id, d.title, d.node_id, n.name AS node_name,
                jsonb_path_query_array(d.content, 'strict $.**.text') AS texts
         FROM node_documents d LEFT JOIN mindmap_nodes n ON n.id = d.node_id
         WHERE (d.title ILIKE $1 OR jsonb_path_query_array(d.content, 'strict $.**.text')::text ILIKE $1)${nodeFilter('d.node_id')}
         ORDER BY (d.title ILIKE $1) DESC, d.updated_at DESC LIMIT 10`, [like],
      )).rows;
      for (const r of rows) {
        const text = Array.isArray(r.texts) ? r.texts.join(' ') : '';
        hits.push({ kind: 'doc', refId: r.id, title: markTitle(r.title, q), snippet: markedSnippet(text, q), nodeId: r.node_id, nodeName: r.node_name });
      }
    }
    if (want('file')) {
      const rows = (await this.db.query(
        `SELECT DISTINCT ON (f.id) f.id, f.name, f.path, f.mime, f.source_url, f.document_id, f.node_id,
                n.name AS node_name, t.page, t.text
         FROM files f
         LEFT JOIN mindmap_nodes n ON n.id = f.node_id
         LEFT JOIN file_texts t ON t.file_id = f.id AND t.text ILIKE $1
         WHERE (f.name ILIKE $1 OR t.file_id IS NOT NULL)${nodeFilter('f.node_id')}
         ORDER BY f.id DESC, t.page
         LIMIT 15`, [like],
      )).rows;
      for (const r of rows) {
        hits.push({
          kind: 'file', refId: r.id, title: markTitle(r.name, q), snippet: r.text ? markedSnippet(r.text, q) : '',
          nodeId: r.node_id, nodeName: r.node_name, page: r.page ?? null, path: r.path, mime: r.mime,
          sourceUrl: r.source_url, documentId: r.document_id,
        });
      }
    }
    return hits.slice(0, limit);
  }
}