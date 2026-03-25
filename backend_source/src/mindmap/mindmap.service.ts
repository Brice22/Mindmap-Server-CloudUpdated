import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Neo4jService } from '../neo4j/neo4j.service';
import { MeiliSearch } from 'meilisearch';
import { SurrealService } from '../surrealdb/surreal.service';
import { MindsDBService } from '../mindsdb/mindsdb.service';

@Injectable()
export class MindmapService {
  private readonly logger = new Logger(MindmapService.name);
  private client = new MeiliSearch({ host: 'http://meilisearch:7700', apiKey: process.env.MEILI_MASTER_KEY || 'masterKey' });

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(Neo4jService) private readonly neo4j: Neo4jService,
    @Inject(SurrealService) private readonly surreal: SurrealService,
    @Inject(MindsDBService) private readonly mindsdb: MindsDBService,
  ) {}

  async syncRelationship(childId: number, parentName: string) {
      const parentRes = await this.db.query("SELECT id FROM mindmap_nodes WHERE lower(name) = lower($1)", [parentName]);
      if (parentRes.rows.length === 0) return;
      const parentId = parentRes.rows[0].id;

  await this.neo4j.write(`
      MERGE (c:Node {pgId: $childId})
      MERGE (p:Node {pgId: $parentId})
      MERGE (c)-[:CHILD_OF]->(p)
    `, { childId, parentId });
  }

  async deleteNode(id: number) {
    await this.db.query("DELETE FROM mindmap_nodes WHERE id = $1", [id]);
    await this.neo4j.write("MATCH (n:Node {pgId: $id}) DETACH DELETE n", { id });
    await this.client.index("nodes").deleteDocument(id.toString());
    return { success: true };
  }
  async findAll() {
    const sql = `SELECT * FROM mindmap_nodes ORDER BY id DESC;`;
    const result = await this.db.query(sql);
    return result.rows;
  }

  async createNode(name: string, description: string, type: string, extraMeta: any = {}) {
    const sql = `
      INSERT INTO mindmap_nodes (name, description, metadata, x, y)
      VALUES ($1, $2, $3, 0, 0)
      RETURNING *;
    `;
    const finalMeta = { ...extraMeta, type, source: 'dashboard' };
    const result = await this.db.query(sql, [name, description, JSON.stringify(finalMeta)]);
    
    // Sync Search
    await this.client.index('nodes').addDocuments([{
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description
    }]);

    // Sync to SurrealDB for semantic search
    try {
      const tags = await this.mindsdb.suggestTags(name, description);
      await this.surreal.upsertNodeEmbedding(result.rows[0].id, name, description, tags);
    } catch (e: any) {
      this.logger.warn('SurrealDB/MindsDB sync skipped: ' + e.message);
    }

    return result.rows[0];
  }

  async updateNode(id: number, name?: string, description?: string, extraMeta?: any, x?: number, y?: number) {
     console.log(`SERVICE DATA RECEIVED - ID: ${id}, X: ${x} (Type: ${typeof x}), Y: ${y}`);
    const check = await this.db.query('SELECT * FROM mindmap_nodes WHERE id = $1', [id]);
    if (check.rows.length === 0) {
    console.error("Node not found, skipping update.");
    return null;
}

    const row = check.rows[0];
    const finalName = name !== undefined ? name : row.name;
    const finalDesc = description !== undefined ? description : row.description;
    const oldMeta = check.rows[0].metadata || {};
    const finalMeta = { ...oldMeta, ...extraMeta };
    const finalX = x !== undefined ? Math.round(Number(x)) : row.x;
    const finalY = y !== undefined ? Math.round(Number(y)) : row.y;

    const sql = `
      UPDATE mindmap_nodes
      SET name = $1, description = $2, metadata = $3, x = $4, y = $5
      WHERE id = $6
      RETURNING *;
    `;
    const result = await this.db.query(sql, [finalName, finalDesc, JSON.stringify(finalMeta), finalX, finalY, id]);

    // Sync Search
try {
    await this.client.index('nodes').updateDocuments([{
      id: result.rows[0].id,
      name: result.rows[0].name,
      description: result.rows[0].description
    }]);
} catch (e: any) {
    console.error("MeiliSearch Sync Failed", e.message); 
}
return result.rows[0];
}

  async searchNodes(query: string) {
    try {
      const results = await this.client.index('nodes').search(query, { limit: 20 });
      return results.hits;
    } catch (e: any) {
      const sql = `SELECT * FROM mindmap_nodes WHERE name ILIKE $1 OR description ILIKE $1 LIMIT 20`;
      const result = await this.db.query(sql, [`%${query}%`]);
      return result.rows;
    }
  }

  async toggleBookmark(id: number) {
    const check = await this.db.query('SELECT metadata FROM mindmap_nodes WHERE id = $1', [id]);
    if (check.rows.length === 0) return null;

    const meta = check.rows[0].metadata || {};
    meta.bookmarked = !meta.bookmarked;

    await this.db.query('UPDATE mindmap_nodes SET metadata = $1 WHERE id = $2', [
      JSON.stringify(meta), id
    ]);

    return { id, bookmarked: meta.bookmarked };
  }
   
}
