// ============================================================
// LINKS SERVICE - your own lines between any two nodes
// ============================================================
// A parent line says "this belongs under that". A link says anything
// else: "Prerequisite", "Causes", "Example of"… Each link has a
// LINK TYPE you name yourself, with its own colour, dashed or solid
// line, and an arrow if the direction matters. An optional label
// adds a few words on that one line.
//
// Tables (made in database.service.ts):
//   link_types  name, color, dashed, arrow, description, sort_order
//   node_links  source_id → target_id, type_id, label
// Deleting a node deletes its links; the Trash keeps a copy and puts
// them back on restore. Deleting a link type keeps its links as plain
// grey lines ("No type").
// Every change tells open browsers to reload links (live updates).
// ============================================================

import { Injectable, Inject, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MindmapGateway } from './mindmap.gateway';
import { GraphService } from './graph.service';

const HEX = /^#[0-9a-fA-F]{6}$/;

export interface LinkTypeInput { name?: string; color?: string; dashed?: boolean; arrow?: boolean; description?: string; sortOrder?: number }
export interface LinkInput { sourceId?: number; targetId?: number; typeId?: number | null; label?: string }

@Injectable()
export class LinksService {
    constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(MindmapGateway) private readonly gateway: MindmapGateway,
    @Inject(GraphService) private readonly graph: GraphService,
  ) {}

  // Tell every open browser to reload links
  private changed() {
    try { this.gateway.server?.emit('links_changed'); } catch {}
    this.graph.markDirty();          // 🧭 update the Neo4j copy
  }

  // Postgres errors → plain messages
  private explain(e: any): never {
    if (e?.code === '23505') throw new BadRequestException('A link type with that name already exists');
    if (e?.code === '23503') throw new BadRequestException('That node or link type no longer exists');
    if (e?.code === '23514') throw new BadRequestException('A node can\'t link to itself');
    throw e;
  }

  // ------------------------------------------------------------
  // EVERYTHING THE GRAPH NEEDS (one call)
  // ------------------------------------------------------------
  async all() {
    const [types, links] = await Promise.all([
      this.db.query(`SELECT id, name, color, dashed, arrow, description, sort_order AS "sortOrder"
                     FROM link_types ORDER BY sort_order, name`),
      this.db.query(`SELECT id, source_id AS "sourceId", target_id AS "targetId", type_id AS "typeId", label
                     FROM node_links ORDER BY id`),
    ]);
    return { types: types.rows, links: links.rows };
  }

  // ------------------------------------------------------------
  // LINK TYPES
  // ------------------------------------------------------------
  private cleanType(b: LinkTypeInput, partial: boolean) {
    const out: Record<string, any> = {};
    if (b.name !== undefined || !partial) {
      const name = String(b.name ?? '').trim();
      if (!name || name.length > 40) throw new BadRequestException('Give the link type a name (up to 40 letters)');
      out.name = name;
    }
    if (b.color !== undefined || !partial) {
      const color = String(b.color ?? '#a855f7').trim();
      if (!HEX.test(color)) throw new BadRequestException('Colour must look like #a855f7');
      out.color = color.toLowerCase();
    }
    if (b.dashed !== undefined) out.dashed = !!b.dashed;
    if (b.arrow !== undefined) out.arrow = !!b.arrow;
    if (b.description !== undefined) out.description = String(b.description || '').slice(0, 200);
    if (b.sortOrder !== undefined && Number.isFinite(Number(b.sortOrder))) out.sort_order = Math.round(Number(b.sortOrder));
    return out;
  }

  async createType(b: LinkTypeInput) {
    const t = this.cleanType(b, false);
    try {
      const res = await this.db.query(
        `INSERT INTO link_types (name, color, dashed, arrow, description, sort_order)
         VALUES ($1, $2, $3, $4, $5, COALESCE($6, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM link_types)))
         RETURNING id, name, color, dashed, arrow, description, sort_order AS "sortOrder"`,
        [t.name, t.color, t.dashed ?? true, t.arrow ?? false, t.description ?? '', t.sort_order ?? null],
      );
      this.changed();
      return res.rows[0];
    } catch (e) { this.explain(e); }
  }

  async updateType(id: number, b: LinkTypeInput) {
    const t = this.cleanType(b, true);
    const keys = Object.keys(t);
    if (!keys.length) throw new BadRequestException('Nothing to change');
    try {
      const res = await this.db.query(
        `UPDATE link_types SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1
         RETURNING id, name, color, dashed, arrow, description, sort_order AS "sortOrder"`,
        [id, ...keys.map(k => t[k])],
      );
      if (!res.rows[0]) throw new NotFoundException('No such link type');
      this.changed();
      return res.rows[0];
    } catch (e) { this.explain(e); }
  }

  async deleteType(id: number) {
    const res = await this.db.query('DELETE FROM link_types WHERE id = $1', [id]);
    if (!res.rowCount) throw new NotFoundException('No such link type');
    this.changed();
    return { success: true };
  }

  // ------------------------------------------------------------
  // LINKS
  // ------------------------------------------------------------
  private toId(v: any): number | null {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  }

  async createLink(b: LinkInput) {
    const sourceId = this.toId(b.sourceId), targetId = this.toId(b.targetId);
    if (!sourceId || !targetId) throw new BadRequestException('Pick the two nodes to link');
    if (sourceId === targetId) throw new BadRequestException('A node can\'t link to itself');
    const typeId = b.typeId == null ? null : this.toId(b.typeId);
    try {
      const res = await this.db.query(
        `INSERT INTO node_links (source_id, target_id, type_id, label) VALUES ($1, $2, $3, $4)
         RETURNING id, source_id AS "sourceId", target_id AS "targetId", type_id AS "typeId", label`,
        [sourceId, targetId, typeId, String(b.label || '').slice(0, 80)],
      );
      this.changed();
      return res.rows[0];
    } catch (e) { this.explain(e); }
  }

  // Change the type or label, or turn the arrow around (reverse: true)
  async updateLink(id: number, b: LinkInput & { reverse?: boolean }) {
    const sets: string[] = [];
    const params: any[] = [id];
    if (b.typeId !== undefined) { params.push(b.typeId == null ? null : this.toId(b.typeId)); sets.push(`type_id = $${params.length}`); }
    if (b.label !== undefined) { params.push(String(b.label || '').slice(0, 80)); sets.push(`label = $${params.length}`); }
    if (b.reverse) sets.push('source_id = target_id, target_id = source_id');
    if (!sets.length) throw new BadRequestException('Nothing to change');
    try {
      const res = await this.db.query(
        `UPDATE node_links SET ${sets.join(', ')} WHERE id = $1
         RETURNING id, source_id AS "sourceId", target_id AS "targetId", type_id AS "typeId", label`,
        params,
      );
      if (!res.rows[0]) throw new NotFoundException('No such link');
      this.changed();
      return res.rows[0];
    } catch (e) { this.explain(e); }
  }

  async deleteLink(id: number) {
    const res = await this.db.query('DELETE FROM node_links WHERE id = $1', [id]);
    if (!res.rowCount) throw new NotFoundException('No such link');
    this.changed();
    return { success: true };
  }
}