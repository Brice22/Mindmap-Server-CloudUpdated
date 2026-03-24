// ============================================================
// NODES SERVICE - Family Tree / Person Operations
// ============================================================
// PURPOSE: Simplified service for creating "Person" type nodes.
//
// WHY SEPARATE FROM MINDMAPSERVICE?
// - MindmapService handles generic nodes + syncing to 3 databases
// - NodesService is a simpler wrapper for family tree operations
// - Both write to the same PostgreSQL table
//
// This keeps the family tree code cleaner and separate.
// ============================================================

import { Injectable, Inject } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class NodesService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService
  ) {}

  // ============================================================
  // CREATE PERSON
  // ============================================================
  // Creates a node specifically for the family tree feature.
  // Sets type to 'person' automatically.
  //
  // PARAMETERS:
  //   name     - Person's name
  //   bio      - Biography text
  //   metadata - Extra data (birthdate, etc.)
  // ============================================================
  async createPerson(name: string, bio: string, metadata: any = {}) {
    const sql = `
      INSERT INTO mindmap_nodes (name, description, metadata, x, y)
      VALUES ($1, $2, $3, 400, 300)
      RETURNING *;
    `;
    
    // Force type to 'person' for family tree nodes
    const finalMeta = { ...metadata, type: 'person' };
    
    const result = await this.db.query(sql, [
      name,
      bio,
      JSON.stringify(finalMeta),
    ]);
    
    return result.rows[0];
  }

  // ============================================================
  // CREATE NODE (Generic)
  // ============================================================
  // FIX: Added this method - was missing but called by GraphQL resolver
  //
  // PARAMETERS:
  //   name     - Node name
  //   bio      - Description
  //   metadata - Any extra data including type, parent, etc.
  // ============================================================
  async createNode(name: string, bio: string, metadata: any = {}) {
    const sql = `
      INSERT INTO mindmap_nodes (name, description, metadata, x, y)
      VALUES ($1, $2, $3, 400, 300)
      RETURNING *;
    `;
    
    const result = await this.db.query(sql, [
      name,
      bio,
      JSON.stringify(metadata),
    ]);
    
    return result.rows[0];
  }

  // ============================================================
  // FIND ALL NODES
  // ============================================================
  // FIX: Added this method - was missing but called by GraphQL resolver
  //
  // Returns all nodes, optionally filtered by type
  // ============================================================
  async findAllNodes(type?: string) {
    let sql = 'SELECT * FROM mindmap_nodes';
    const params: any[] = [];
    
    if (type) {
      sql += ` WHERE metadata->>'type' = $1`;
      params.push(type);
    }
    
    sql += ' ORDER BY id DESC';
    
    const result = await this.db.query(sql, params);
    return result.rows;
  }

  // ============================================================
  // FIND ONE NODE
  // ============================================================
  async findOne(id: number) {
    const sql = 'SELECT * FROM mindmap_nodes WHERE id = $1';
    const result = await this.db.query(sql, [id]);
    return result.rows[0] || null;
  }

  // ============================================================
  // UPDATE NODE
  // ============================================================
  async updateNode(id: number, updates: Partial<{
    name: string;
    description: string;
    metadata: any;
    x: number;
    y: number;
  }>) {
    // Build dynamic UPDATE query
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.name !== undefined) {
      fields.push(`name = $${paramIndex++}`);
      values.push(updates.name);
    }
    if (updates.description !== undefined) {
      fields.push(`description = $${paramIndex++}`);
      values.push(updates.description);
    }
    if (updates.metadata !== undefined) {
      fields.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(updates.metadata));
    }
    if (updates.x !== undefined) {
      fields.push(`x = $${paramIndex++}`);
      values.push(Math.round(updates.x));
    }
    if (updates.y !== undefined) {
      fields.push(`y = $${paramIndex++}`);
      values.push(Math.round(updates.y));
    }

    if (fields.length === 0) {
      return this.findOne(id);  // Nothing to update
    }

    values.push(id);
    const sql = `
      UPDATE mindmap_nodes 
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.db.query(sql, values);
    return result.rows[0];
  }

  // ============================================================
  // DELETE NODE
  // ============================================================
  async deleteNode(id: number) {
    const sql = 'DELETE FROM mindmap_nodes WHERE id = $1 RETURNING *';
    const result = await this.db.query(sql, [id]);
    return result.rows[0];
  }
}

