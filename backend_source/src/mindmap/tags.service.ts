// ============================================================
// 🏷 TAGS - coloured labels you make (Bioengineering, CNC, Finance…)
// ============================================================
// The tag list (name + colour) lives in the "tags" table; which nodes
// carry a tag is in each node's metadata.tags (a list of names), so the
// graph and Quiz Center can filter without extra lookups.
// Renaming a tag renames it on every node; deleting removes it from every
// node (the nodes themselves stay).
// ============================================================

import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { KeyDBService } from '../keydb/keydb.service';

const HEX = /^#[0-9a-fA-F]{6}$/;

@Injectable()
export class TagsService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(KeyDBService) private readonly cache: KeyDBService,
  ) {}

  private clean(b: any, partial: boolean) {
    const out: Record<string, string> = {};
    if (b.name !== undefined || !partial) {
      const name = String(b.name ?? '').trim().replace(/\s+/g, ' ');
      if (!name || name.length > 40) throw new BadRequestException('Give the tag a name (up to 40 letters)');
      out.name = name;
    }
    if (b.color !== undefined || !partial) {
      const color = String(b.color ?? '#60a5fa').trim();
      if (!HEX.test(color)) throw new BadRequestException('Colour must look like #60a5fa');
      out.color = color.toLowerCase();
    }
    return out;
  }

  // Same name in another case ("cnc" vs "CNC") counts as taken
  private async taken(name: string, exceptId = 0) {
    const r = await this.db.query('SELECT 1 FROM tags WHERE lower(name) = lower($1) AND id <> $2', [name, exceptId]);
    if (r.rows.length) throw new BadRequestException('A tag with that name already exists');
  }

  async list() {
    const res = await this.db.query(
      `SELECT t.id, t.name, t.color,
              (SELECT COUNT(*)::int FROM mindmap_nodes n WHERE COALESCE(n.metadata->'tags', '[]'::jsonb) ? t.name) AS nodes
       FROM tags t ORDER BY lower(t.name)`,
    );
    return res.rows;
  }

  async create(b: any) {
    const t = this.clean(b, false);
    await this.taken(t.name);
    try {
      return (await this.db.query('INSERT INTO tags (name, color) VALUES ($1, $2) RETURNING id, name, color', [t.name, t.color])).rows[0];
    } catch (e: any) {
      if (e?.code === '23505') throw new BadRequestException('A tag with that name already exists');
      throw e;
    }
  }

  async update(id: number, b: any) {
    const old = (await this.db.query('SELECT * FROM tags WHERE id = $1', [id])).rows[0];
    if (!old) throw new NotFoundException('No such tag');
    const t = this.clean(b, true);
    if (t.name) await this.taken(t.name, id);
    try {
      const row = (await this.db.query(
        'UPDATE tags SET name = COALESCE($2, name), color = COALESCE($3, color) WHERE id = $1 RETURNING id, name, color',
        [id, t.name ?? null, t.color ?? null],
      )).rows[0];
      if (t.name && t.name !== old.name) await this.renameOnNodes(old.name, t.name);
      return row;
    } catch (e: any) {
      if (e?.code === '23505') throw new BadRequestException('A tag with that name already exists');
      throw e;
    }
  }

  async remove(id: number) {
    const old = (await this.db.query('DELETE FROM tags WHERE id = $1 RETURNING name', [id])).rows[0];
    if (!old) throw new NotFoundException('No such tag');
    await this.renameOnNodes(old.name, null);
    return { success: true };
  }

  // Rename (or with null, remove) a tag in every node's metadata.tags
  private async renameOnNodes(from: string, to: string | null) {
    await this.db.query(
      `UPDATE mindmap_nodes n
       SET metadata = jsonb_set(n.metadata, '{tags}', COALESCE((
         SELECT jsonb_agg(DISTINCT x) FROM (
           SELECT CASE WHEN t = $1 THEN $2 ELSE t END AS x FROM jsonb_array_elements_text(n.metadata->'tags') AS t
         ) s WHERE x IS NOT NULL
       ), '[]'::jsonb))
       WHERE jsonb_typeof(n.metadata->'tags') = 'array' AND n.metadata->'tags' ? $1`,
      [from, to],
    );
    try { await this.cache.invalidateNodeCache(); } catch {}   // the graph reloads nodes from a 30-second cache
  }
}