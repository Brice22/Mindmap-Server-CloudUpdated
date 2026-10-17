// ============================================================
// FILES SERVICE - the file library (everything in cloud_data)
// ============================================================
// Every file has a row in "files": where it is (relative path),
// its name, type and size, and optionally the node it belongs to.
//   kind 'upload'  uploaded in 📎 Files
//   kind 'web'     saved from a link (a PDF, video, …) or a saved
//                  web page (then document_id is its document)
//   kind 'found'   was already in cloud_data (found by a scan)
// Deleting moves the file to uploads/.trash and into the Trash list;
// restoring moves it back. After 30 days it is removed for good.
// ============================================================

import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { DatabaseService } from '../database/database.service';
import { TrashService } from './trash.service';
import { UPLOAD_ROOT, TRASH_DIR, absPath, relPath, movePath, mimeFromName } from './uploads';

const SCAN_LIMIT = 50_000;     // stop after this many files per scan
const SKIP_TOP = new Set([TRASH_DIR, 'web', 'node_modules']);  // web pages are registered when saved

export interface NewFile {
  path: string;
  name: string;
  mime?: string;
  size?: number;
  nodeId?: number | null;
  sourceUrl?: string | null;
  kind?: 'upload' | 'web' | 'found';
  documentId?: number | null;
}

// Filters for the library's type buttons
const TYPE_FILTERS: Record<string, string> = {
  image: `f.mime LIKE 'image/%'`,
  video: `f.mime LIKE 'video/%'`,
  audio: `f.mime LIKE 'audio/%'`,
  document: `(f.mime IN ('application/pdf', 'application/epub+zip', 'text/plain', 'text/markdown', 'text/csv')
              OR f.mime LIKE 'application/vnd.%' OR f.mime = 'application/msword') AND f.path NOT LIKE 'web/%'`,
  web: `f.path LIKE 'web/%'`,
};

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);
  private scanning: Promise<any> | null = null;

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(TrashService) private readonly trash: TrashService,
  ) {}

  async register(f: NewFile) {
    const res = await this.db.query(
      `INSERT INTO files (path, name, mime, size, node_id, source_url, kind, document_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (path) DO UPDATE SET name = EXCLUDED.name, mime = EXCLUDED.mime, size = EXCLUDED.size,
         node_id = COALESCE(EXCLUDED.node_id, files.node_id)
       RETURNING *`,
      [f.path, f.name, f.mime || mimeFromName(f.name), f.size || 0, f.nodeId ?? null,
       f.sourceUrl ?? null, f.kind || 'upload', f.documentId ?? null],
    );
    return res.rows[0];
  }

  async list(opts: { search?: string; nodeId?: number; type?: string; limit?: number }) {
    const where: string[] = [];
    const params: any[] = [];
    if (opts.search?.trim()) {
      params.push(`%${opts.search.trim()}%`);
      where.push(`(f.name ILIKE $${params.length} OR f.path ILIKE $${params.length} OR f.source_url ILIKE $${params.length})`);
    }
    if (opts.nodeId) {
      params.push(opts.nodeId);
      where.push(`f.node_id = $${params.length}`);
    }
    if (opts.type && TYPE_FILTERS[opts.type]) where.push(TYPE_FILTERS[opts.type]);
    if (opts.type === 'other') where.push(`NOT (${Object.values(TYPE_FILTERS).join(' OR ')})`);
    params.push(Math.min(Number(opts.limit) || 500, 2000));
    const res = await this.db.query(
      `SELECT f.*, n.name AS node_name, d.title AS document_title
       FROM files f
       LEFT JOIN mindmap_nodes n ON n.id = f.node_id
       LEFT JOIN node_documents d ON d.id = f.document_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY f.created_at DESC, f.id DESC
       LIMIT $${params.length}`,
      params,
    );
    return res.rows;
  }

  async get(id: number) {
    const row = (await this.db.query('SELECT * FROM files WHERE id = $1', [id])).rows[0];
    if (!row) throw new NotFoundException(`File ${id} not found`);
    return row;
  }

  // Change the display name or the node it belongs to (null = none)
  async update(id: number, body: { name?: string; nodeId?: number | null }) {
    const sets: string[] = []; const values: any[] = [];
    if (typeof body.name === 'string' && body.name.trim()) { values.push(body.name.trim()); sets.push(`name = $${values.length}`); }
    if (body.nodeId !== undefined) { values.push(body.nodeId === null ? null : Number(body.nodeId)); sets.push(`node_id = $${values.length}`); }
    if (!sets.length) return this.get(id);
    values.push(id);
    const res = await this.db.query(`UPDATE files SET ${sets.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
    return res.rows[0];
  }

  // Move to the Trash (a saved web page moves its whole folder)
  async remove(id: number) {
    const file = await this.get(id);
    const what = file.path.startsWith('web/') ? path.posix.dirname(file.path) : file.path;
    let trashPath: string | null = null;
    if (fs.existsSync(absPath(what))) {
      trashPath = await movePath(what, `${TRASH_DIR}/${file.id}-${path.posix.basename(what)}`);
    }
    await this.trash.saveFile(file, what, trashPath);
    await this.db.query('DELETE FROM files WHERE id = $1', [id]);
    return { success: true };
  }

  // ------------------------------------------------------------
  // SCAN: register files already in cloud_data, forget rows whose file is gone
  // ------------------------------------------------------------
  scan() {
    if (!this.scanning) {
      this.scanning = this.doScan().finally(() => { this.scanning = null; });
    }
    return this.scanning;
  }

  private async doScan() {
    if (!fs.existsSync(UPLOAD_ROOT)) return { added: 0, removed: 0 };
    const known = new Map<string, number>();
    for (const r of (await this.db.query('SELECT id, path FROM files')).rows) known.set(r.path, r.id);

    const found: { rel: string; size: number; mtime: Date }[] = [];
    const walk = async (dir: string, depth: number) => {
      if (found.length >= SCAN_LIMIT || depth > 12) return;
      let entries: fs.Dirent[];
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (found.length >= SCAN_LIMIT) return;
        if (e.name.startsWith('.')) continue;
        const abs = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (depth === 0 && SKIP_TOP.has(e.name)) continue;
          await walk(abs, depth + 1);
        } else if (e.isFile()) {
          const rel = relPath(abs);
          if (known.has(rel)) { known.delete(rel); continue; }
          try {
            const st = await fs.promises.stat(abs);
            found.push({ rel, size: st.size, mtime: st.mtime });
          } catch {}
        }
      }
    };
    await walk(UPLOAD_ROOT, 0);

    for (const f of found) {
      await this.db.query(
        `INSERT INTO files (path, name, mime, size, kind, created_at) VALUES ($1, $2, $3, $4, 'found', $5)
         ON CONFLICT (path) DO NOTHING`,
        [f.rel, path.posix.basename(f.rel), mimeFromName(f.rel), f.size, f.mtime],
      );
    }
    // Rows left in "known" were not seen on disk. Web pages live in skipped folders, so check those directly.
    let removed = 0;
    for (const [rel, id] of known) {
      if (!fs.existsSync(absPath(rel))) {
        await this.db.query('DELETE FROM files WHERE id = $1', [id]);
        removed++;
      }
    }
    if (found.length || removed) this.logger.log(`Files scan: ${found.length} added, ${removed} removed`);
    return { added: found.length, removed };
  }
}