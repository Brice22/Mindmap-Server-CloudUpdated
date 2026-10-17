// ============================================================
// TRASH SERVICE - deleted nodes, documents and files, restorable for 30 days
// ============================================================
// Deleting a node or document first saves a full copy here, then
// deletes it as before (so nothing else in the app has to know about
// the Trash). Restoring puts it back with the same id:
//   - node:     its documents come home again (if still Unfiled) and
//               its document links are re-created
//   - document: back in its home node (or Unfiled if that node is
//               gone), re-linked to the nodes that still exist
//   - file:     moved back from uploads/.trash to where it was
// Items older than 30 days are removed automatically (checked at
// startup and every 6 hours). "Delete forever" removes one now.
// ============================================================

import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TRASH_DIR, movePath, removePath } from './uploads';

export const TRASH_DAYS = 30;

@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name);

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {
    setTimeout(() => this.purgeOld().catch(() => {}), 15_000);
    setInterval(() => this.purgeOld().catch(() => {}), 6 * 60 * 60 * 1000);
  }

  // ------------------------------------------------------------
  // SAVE A COPY (called just before deleting)
  // ------------------------------------------------------------
  async saveNode(nodeId: number) {
    const node = (await this.db.query('SELECT * FROM mindmap_nodes WHERE id = $1', [nodeId])).rows[0];
    if (!node) return;
    const home = await this.db.query('SELECT id FROM node_documents WHERE node_id = $1', [nodeId]);
    const links = await this.db.query('SELECT document_id FROM node_document_links WHERE node_id = $1', [nodeId]);
    const files = await this.db.query('SELECT id FROM files WHERE node_id = $1', [nodeId]);
    await this.db.query(
      `INSERT INTO trash (item_type, item_id, title, data) VALUES ('node', $1, $2, $3)`,
      [nodeId, node.name, JSON.stringify({
        node,
        homeDocIds: home.rows.map((r: any) => r.id),
        linkedDocIds: links.rows.map((r: any) => r.document_id),
        fileIds: files.rows.map((r: any) => r.id),
      })],
    );
  }

  async saveDocument(docId: number) {
    const doc = (await this.db.query('SELECT * FROM node_documents WHERE id = $1', [docId])).rows[0];
    if (!doc) return;
    const links = await this.db.query('SELECT node_id FROM node_document_links WHERE document_id = $1', [docId]);
         const cards = await this.db.query('SELECT * FROM flashcards WHERE document_id = $1', [docId]);   // keeps their review history
      await this.db.query(
        `INSERT INTO trash (item_type, item_id, title, data) VALUES ('document', $1, $2, $3)`,
        [docId, doc.title, JSON.stringify({ doc, linkedNodeIds: links.rows.map((r: any) => r.node_id), flashcards: cards.rows })],
      );
  }

  // A file (or a saved web page's folder) already moved to uploads/.trash
  async saveFile(file: any, originalPath: string, trashPath: string | null) {
    await this.db.query(
      `INSERT INTO trash (item_type, item_id, title, data) VALUES ('file', $1, $2, $3)`,
      [file.id, file.name, JSON.stringify({ file, originalPath, trashPath })],
    );
  }

  // ------------------------------------------------------------
  // LIST / RESTORE / DELETE
  // ------------------------------------------------------------
  async list() {
    await this.purgeOld();
    const res = await this.db.query(
      `SELECT t.id, t.item_type, t.item_id, t.title, t.deleted_at,
              GREATEST(0, ${TRASH_DAYS} - EXTRACT(DAY FROM (CURRENT_TIMESTAMP - t.deleted_at)))::int AS days_left,
              CASE WHEN t.item_type IN ('document', 'file') THEN h.name END AS home_node_name,
              CASE WHEN t.item_type = 'node' THEN jsonb_array_length(COALESCE(t.data->'homeDocIds', '[]'::jsonb)) END AS doc_count
       FROM trash t
       LEFT JOIN mindmap_nodes h ON t.item_type IN ('document', 'file')
            AND h.id = (COALESCE(t.data->'doc', t.data->'file')->>'node_id')::int
       ORDER BY t.deleted_at DESC`,
    );
    return res.rows;
  }

  // Puts the item back; returns what was restored so the caller can re-sync search, graph and backlinks
  async restore(trashId: number): Promise<{ type: 'node' | 'document' | 'file'; row: any }> {
    const item = (await this.db.query('SELECT * FROM trash WHERE id = $1', [trashId])).rows[0];
    if (!item) throw new NotFoundException('Not in Trash');
    const data = item.data;

    if (item.item_type === 'node') {
      const node = { ...data.node };
      // Same id if it's free, otherwise a new one
      const taken = (await this.db.query('SELECT 1 FROM mindmap_nodes WHERE id = $1', [node.id])).rows.length > 0;
      if (taken) node.id = (await this.db.query(`SELECT nextval(pg_get_serial_sequence('mindmap_nodes', 'id')) AS id`)).rows[0].id;
      const row = (await this.db.query(
        'INSERT INTO mindmap_nodes SELECT * FROM jsonb_populate_record(NULL::mindmap_nodes, $1::jsonb) RETURNING *',
        [JSON.stringify(node)],
      )).rows[0];
      // Its documents come home (only those still Unfiled), and its links come back
      await this.db.query(
        'UPDATE node_documents SET node_id = $1 WHERE id = ANY($2::int[]) AND node_id IS NULL',
        [row.id, data.homeDocIds || []],
      );
      await this.db.query(
        `INSERT INTO node_document_links (node_id, document_id)
         SELECT $1, d FROM unnest($2::int[]) AS d WHERE EXISTS (SELECT 1 FROM node_documents WHERE id = d)
         ON CONFLICT DO NOTHING`,
        [row.id, data.linkedDocIds || []],
      );
      await this.db.query(
        'UPDATE files SET node_id = $1 WHERE id = ANY($2::int[]) AND node_id IS NULL',
        [row.id, data.fileIds || []],
      );

            // Its flashcards come back with their review history
      for (const card of data.flashcards || []) {
        const c = { ...card, document_id: row.id };
        if ((await this.db.query('SELECT 1 FROM flashcards WHERE id = $1', [c.id])).rows.length) {
          c.id = (await this.db.query(`SELECT nextval(pg_get_serial_sequence('flashcards', 'id')) AS id`)).rows[0].id;
        }
        await this.db.query(
          `INSERT INTO flashcards SELECT * FROM jsonb_populate_record(NULL::flashcards, $1::jsonb) ON CONFLICT DO NOTHING`,
          [JSON.stringify(c)],
        );
      }
      await this.db.query('DELETE FROM trash WHERE id = $1', [trashId]);
      return { type: 'node', row };
    }

    if (item.item_type === 'file') {
      const file = { ...data.file };
      // Move it back (a number is added to the name if something new took its place)
      if (data.trashPath) {
        const back = await movePath(data.trashPath, data.originalPath);
        if (back !== data.originalPath) file.path = back + file.path.slice(data.originalPath.length);
      }
      if (file.node_id && !(await this.db.query('SELECT 1 FROM mindmap_nodes WHERE id = $1', [file.node_id])).rows.length) file.node_id = null;
      if (file.document_id && !(await this.db.query('SELECT 1 FROM node_documents WHERE id = $1', [file.document_id])).rows.length) file.document_id = null;
      if ((await this.db.query('SELECT 1 FROM files WHERE id = $1', [file.id])).rows.length) {
        file.id = (await this.db.query(`SELECT nextval(pg_get_serial_sequence('files', 'id')) AS id`)).rows[0].id;
      }
      const row = (await this.db.query(
        'INSERT INTO files SELECT * FROM jsonb_populate_record(NULL::files, $1::jsonb) RETURNING *',
        [JSON.stringify(file)],
      )).rows[0];
      await this.db.query('DELETE FROM trash WHERE id = $1', [trashId]);
      return { type: 'file', row };
    }

    // Document
    const doc = { ...data.doc };
    const taken = (await this.db.query('SELECT 1 FROM node_documents WHERE id = $1', [doc.id])).rows.length > 0;
    if (taken) doc.id = (await this.db.query(`SELECT nextval(pg_get_serial_sequence('node_documents', 'id')) AS id`)).rows[0].id;
    // Home node gone → Unfiled
    if (doc.node_id && !(await this.db.query('SELECT 1 FROM mindmap_nodes WHERE id = $1', [doc.node_id])).rows.length) doc.node_id = null;
    const row = (await this.db.query(
      'INSERT INTO node_documents SELECT * FROM jsonb_populate_record(NULL::node_documents, $1::jsonb) RETURNING id, node_id, title',
      [JSON.stringify(doc)],
    )).rows[0];
    await this.db.query(
      `INSERT INTO node_document_links (node_id, document_id)
       SELECT n, $1 FROM unnest($2::int[]) AS n WHERE EXISTS (SELECT 1 FROM mindmap_nodes WHERE id = n)
       ON CONFLICT DO NOTHING`,
      [row.id, data.linkedNodeIds || []],
    );
    await this.db.query('DELETE FROM trash WHERE id = $1', [trashId]);
    return { type: 'document', row };
  }

  async deleteForever(trashId: number) {
    const res = await this.db.query('DELETE FROM trash WHERE id = $1 RETURNING item_type, data', [trashId]);
    await this.removeFiles(res.rows);
    return { success: true };
  }

  async empty() {
    const res = await this.db.query('DELETE FROM trash RETURNING item_type, data');
    await this.removeFiles(res.rows);
    return { success: true, removed: res.rowCount };
  }

  async purgeOld() {
    const res = await this.db.query(
      `DELETE FROM trash WHERE deleted_at < CURRENT_TIMESTAMP - INTERVAL '${TRASH_DAYS} days' RETURNING item_type, data`,
    );
    await this.removeFiles(res.rows);
    if (res.rowCount) this.logger.log(`Trash: removed ${res.rowCount} item(s) older than ${TRASH_DAYS} days`);
  }

  // Deleted-for-good files leave the disk too
  private async removeFiles(rows: any[]) {
    for (const r of rows) {
      const p = r.item_type === 'file' ? r.data?.trashPath : null;
      if (typeof p === 'string' && p.startsWith(TRASH_DIR + '/')) await removePath(p);
    }
  }
}