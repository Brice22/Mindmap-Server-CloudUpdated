import { Injectable, Inject, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Neo4jService } from '../neo4j/neo4j.service';
import { MeiliSearch } from 'meilisearch';
import { SurrealService } from '../surrealdb/surreal.service';
import { MindsDBService } from '../mindsdb/mindsdb.service';
import { KeyDBService } from '../keydb/keydb.service';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class MindmapService {
  private readonly logger = new Logger(MindmapService.name);
private _meili: MeiliSearch | null = null;
  private get client(): MeiliSearch {
    if (!this._meili) {
      this._meili = new MeiliSearch({ host: 'http://meilisearch:7700', apiKey: process.env.MEILI_MASTER_KEY || 'masterKey' });
    }
    return this._meili;
  }
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(Neo4jService) private readonly neo4j: Neo4jService,
    @Inject(SurrealService) private readonly surreal: SurrealService,
    @Inject(MindsDBService) private readonly mindsdb: MindsDBService,
    @Inject(KeyDBService) private readonly cache: KeyDBService,
    @Inject(MetricsService) private readonly metrics: MetricsService,
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
    await this.cache.invalidateNodeCache();
    this.metrics.nodeDeletions.inc();
    return { success: true };
  }

  async findAll() {
    return await this.cache.cached('cache:all_nodes', 30, async () => {
      const sql = `SELECT * FROM mindmap_nodes ORDER BY id DESC;`;
      const result = await this.db.query(sql);
      return result.rows;
    });
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
   await this.cache.invalidateNodeCache();
   this.metrics.nodeCreations.inc();

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

await this.cache.invalidateNodeCache();

return result.rows[0];
}

  async searchNodes(query: string) {
    this.metrics.searchQueries.inc();
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

  async generateQuiz(id: number) {
    const check = await this.db.query('SELECT * FROM mindmap_nodes WHERE id = $1', [id]);
    if (check.rows.length === 0) return null;
    const node = check.rows[0];
    return await this.mindsdb.generateQuiz(node.name, node.description || '');
  }

  async findSimilar(id: number) {
    const check = await this.db.query('SELECT metadata FROM mindmap_nodes WHERE id = $1', [id]);
    if (check.rows.length === 0) return [];
    const meta = check.rows[0].metadata || {};
    const tags = meta.tags || [meta.type || 'default'];
    return await this.surreal.findSimilar(tags);
  }

  // === BOOKMARKS ===
  async getBookmarks() {
    const result = await this.db.query('SELECT * FROM bookmarks ORDER BY created_at DESC');
    return result.rows;
  }
  async addBookmark(nodeId: number, nodeName: string, color?: string, groupName?: string) {
    const result = await this.db.query(
      'INSERT INTO bookmarks (node_id, node_name, color, group_name) VALUES ($1, $2, $3, $4) RETURNING *',
      [nodeId, nodeName, color || null, groupName || null]
    );
    return result.rows[0];
  }
  async removeBookmark(id: number) {
    await this.db.query('DELETE FROM bookmarks WHERE id = $1', [id]);
    return { success: true };
  }

  // === CALENDAR EVENTS ===
  async getEvents() {
    const result = await this.db.query('SELECT * FROM calendar_events ORDER BY start_time');
    return result.rows;
  }
  async addEvent(title: string, startTime: string, endTime?: string, nodeId?: number, color?: string) {
    const result = await this.db.query(
      'INSERT INTO calendar_events (title, start_time, end_time, node_id, color) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [title, startTime, endTime || null, nodeId || null, color || null]
    );
    return result.rows[0];
  }
  async updateEvent(id: number, updates: any) {
    const fields: string[] = []; const values: any[] = []; let idx = 1;
    if (updates.title !== undefined) { fields.push(`title = $${idx++}`); values.push(updates.title); }
    if (updates.start_time !== undefined) { fields.push(`start_time = $${idx++}`); values.push(updates.start_time); }
    if (updates.end_time !== undefined) { fields.push(`end_time = $${idx++}`); values.push(updates.end_time); }
    if (updates.done !== undefined) { fields.push(`done = $${idx++}`); values.push(updates.done); }
    if (updates.color !== undefined) { fields.push(`color = $${idx++}`); values.push(updates.color); }
    if (fields.length === 0) return null;
    values.push(id);
    const result = await this.db.query(`UPDATE calendar_events SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    return result.rows[0];
  }
  async deleteEvent(id: number) {
    await this.db.query('DELETE FROM calendar_events WHERE id = $1', [id]);
    return { success: true };
  }

  // === TRANSACTIONS ===
  async getTransactions() {
    const result = await this.db.query('SELECT * FROM transactions ORDER BY date DESC, id DESC');
    return result.rows;
  }
  async addTransaction(name: string, amount: number, category: string, date: string, type: string) {
    const result = await this.db.query(
      'INSERT INTO transactions (name, amount, category, date, type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, amount, category, date, type]
    );
    return result.rows[0];
  }
  async deleteTransaction(id: number) {
    await this.db.query('DELETE FROM transactions WHERE id = $1', [id]);
    return { success: true };
  }

  // === INVESTMENTS ===
  async getInvestments() {
    const result = await this.db.query('SELECT * FROM investments ORDER BY date DESC');
    return result.rows;
  }
  async addInvestment(data: any) {
    const result = await this.db.query(
      'INSERT INTO investments (symbol, shares, buy_price, current_price, source, type, date) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [data.symbol, data.shares, data.buyPrice, data.currentPrice, data.source, data.type, data.date]
    );
    return result.rows[0];
  }
  async updateInvestment(id: number, currentPrice: number) {
    const result = await this.db.query('UPDATE investments SET current_price = $1 WHERE id = $2 RETURNING *', [currentPrice, id]);
    return result.rows[0];
  }
  async deleteInvestment(id: number) {
    await this.db.query('DELETE FROM investments WHERE id = $1', [id]);
    return { success: true };
  }

  // === HEALTH ENTRIES ===
  async getHealthEntries() {
    const result = await this.db.query('SELECT * FROM health_entries ORDER BY date DESC, id DESC');
    return result.rows;
  }
  async addHealthEntry(date: string, type: string, value: number, value2?: number, notes?: string) {
    const result = await this.db.query(
      'INSERT INTO health_entries (date, type, value, value2, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [date, type, value, value2 || null, notes || null]
    );
    return result.rows[0];
  }
  async deleteHealthEntry(id: number) {
    await this.db.query('DELETE FROM health_entries WHERE id = $1', [id]);
    return { success: true };
  }

  // === FLASHCARDS ===
  async getFlashcards() {
    const result = await this.db.query('SELECT * FROM flashcards ORDER BY next_review ASC');
    return result.rows;
  }
  async addFlashcard(data: any) {
    const result = await this.db.query(
      `INSERT INTO flashcards (question, answer, node_id, node_name, difficulty, interval_days, ease_factor, next_review, review_count, last_review)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [data.question, data.answer, data.nodeId || null, data.nodeName || null, data.difficulty || 'medium',
       data.interval || 0, data.easeFactor || 2.5, data.nextReview || new Date().toISOString().split('T')[0],
       data.reviewCount || 0, data.lastReview || null]
    );
    return result.rows[0];
  }
  async updateFlashcard(id: number, updates: any) {
    const fields: string[] = []; const values: any[] = []; let idx = 1;
    if (updates.interval !== undefined) { fields.push(`interval_days = $${idx++}`); values.push(updates.interval); }
    if (updates.easeFactor !== undefined) { fields.push(`ease_factor = $${idx++}`); values.push(updates.easeFactor); }
    if (updates.nextReview !== undefined) { fields.push(`next_review = $${idx++}`); values.push(updates.nextReview); }
    if (updates.reviewCount !== undefined) { fields.push(`review_count = $${idx++}`); values.push(updates.reviewCount); }
    if (updates.lastReview !== undefined) { fields.push(`last_review = $${idx++}`); values.push(updates.lastReview); }
    if (fields.length === 0) return null;
    values.push(id);
    const result = await this.db.query(`UPDATE flashcards SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    return result.rows[0];
  }
  async deleteFlashcard(id: number) {
    await this.db.query('DELETE FROM flashcards WHERE id = $1', [id]);
    return { success: true };
  }

  // === COLLECTIONS ===
  async getCollections() {
    const result = await this.db.query('SELECT * FROM mindmap_collections ORDER BY created_at DESC');
    return result.rows;
  }
  async addCollection(data: any) {
    const result = await this.db.query(
      'INSERT INTO mindmap_collections (name, icon, description, node_ids, color, map_overlay) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [data.name, data.icon || '📋', data.description || null, data.nodeIds || '{}', data.color || null, data.mapOverlay ? JSON.stringify(data.mapOverlay) : null]
    );
    return result.rows[0];
  }
  async deleteCollection(id: number) {
    await this.db.query('DELETE FROM mindmap_collections WHERE id = $1', [id]);
    return { success: true };
  }

  // === NEWS ===
  async getNewsSources() {
    const result = await this.db.query('SELECT * FROM newsfeed_sources ORDER BY name');
    return result.rows;
  }
  async addNewsSource(data: any) {
    const result = await this.db.query(
      'INSERT INTO newsfeed_sources (name, url, type, api_key, category, enabled) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [data.name, data.url, data.type || 'rss', data.apiKey || null, data.category || 'All', data.enabled !== false]
    );
    return result.rows[0];
  }
  async deleteNewsSource(id: number) {
    await this.db.query('DELETE FROM newsfeed_sources WHERE id = $1', [id]);
    return { success: true };
  }
  async getSavedArticles(filter?: string) {
    let sql = 'SELECT * FROM saved_articles';
    if (filter === 'saved') sql += ' WHERE saved = true';
    else if (filter === 'archived') sql += ' WHERE archived = true';
    else if (filter === 'unread') sql += ' WHERE read = false AND archived = false';
    sql += ' ORDER BY created_at DESC';
    const result = await this.db.query(sql);
    return result.rows;
  }
  async saveArticle(data: any) {
    const result = await this.db.query(
      'INSERT INTO saved_articles (title, description, url, source, category, date, saved) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [data.title, data.description || null, data.url, data.source || null, data.category || null, data.date || null, data.saved || false]
    );
    return result.rows[0];
  }
  async updateArticle(id: number, updates: any) {
    const fields: string[] = []; const values: any[] = []; let idx = 1;
    if (updates.read !== undefined) { fields.push(`read = $${idx++}`); values.push(updates.read); }
    if (updates.archived !== undefined) { fields.push(`archived = $${idx++}`); values.push(updates.archived); }
    if (updates.saved !== undefined) { fields.push(`saved = $${idx++}`); values.push(updates.saved); }
    if (fields.length === 0) return null;
    values.push(id);
    const result = await this.db.query(`UPDATE saved_articles SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    return result.rows[0];
  }
   
}
