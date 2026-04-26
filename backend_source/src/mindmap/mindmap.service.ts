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
  ) { // Seed default news sources on first startup
    setTimeout(() => this.seedDefaultSources().catch(() => {}), 5000);}

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
    
    try { await this.client.index("nodes").deleteDocument(id.toString()); } catch {}
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
   
  // === RSS FEED FETCHING ===
  private parseRSSItems(xml: string, sourceName: string, category: string): any[] {
    const items: any[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    
    const getTag = (block: string, tag: string): string => {
      // Handle CDATA
      const cdataMatch = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`));
      if (cdataMatch) return cdataMatch[1].trim();
      const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`));
      return match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
    };

    const getAttr = (block: string, tag: string, attr: string): string => {
      const match = block.match(new RegExp(`<${tag}[^>]*${attr}="([^"]*)"[^>]*/?>`, 'i'));
      return match ? match[1].trim() : '';
    };

    // Try RSS 2.0 <item> format
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const block = match[1];
      const title = getTag(block, 'title');
      const link = getTag(block, 'link');
      const desc = getTag(block, 'description');
      const pubDate = getTag(block, 'pubDate') || getTag(block, 'dc:date');
      if (title && link) {
        items.push({ title, url: link, description: desc.slice(0, 300), source: sourceName, category, date: pubDate || new Date().toISOString() });
      }
    }

    // Try Atom <entry> format if no items found
    if (items.length === 0) {
      while ((match = entryRegex.exec(xml)) !== null) {
        const block = match[1];
        const title = getTag(block, 'title');
        const link = getAttr(block, 'link', 'href') || getTag(block, 'link');
        const desc = getTag(block, 'summary') || getTag(block, 'content');
        const pubDate = getTag(block, 'published') || getTag(block, 'updated');
        if (title && link) {
          items.push({ title, url: link, description: desc.replace(/<[^>]+>/g, '').slice(0, 300), source: sourceName, category, date: pubDate || new Date().toISOString() });
        }
      }
    }

    return items;
  }

  private async fetchHackerNews(): Promise<any[]> {
    try {
      const res = await fetch('https://hn.algolia.com/api/v1/search_by_date?tags=front_page&hitsPerPage=30');
      if (!res.ok) return [];
      const data = await res.json();
      return (data.hits || []).map((hit: any) => ({
        title: hit.title || 'Untitled',
        url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
        description: (hit.comment_text || '').slice(0, 300),
        source: 'Hacker News',
        category: 'Tech',
        date: hit.created_at || new Date().toISOString(),
      }));
    } catch { return []; }
  }

  async fetchAllFeeds(): Promise<{ fetched: number; sources: number }> {
    const sourcesResult = await this.db.query('SELECT * FROM newsfeed_sources WHERE enabled = true');
    const sources = sourcesResult.rows;
    let totalFetched = 0;

    for (const source of sources) {
      try {
        let articles: any[] = [];

        if (source.type === 'hackernews') {
          articles = await this.fetchHackerNews();
        } else {
          // RSS/Atom feed
          const res = await fetch(source.url, {
            headers: { 'User-Agent': 'HServer-Newsfeed/1.0' },
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) continue;
          const xml = await res.text();
          articles = this.parseRSSItems(xml, source.name, source.category || 'All');
        }

        // Insert new articles (skip duplicates by URL)
        for (const article of articles) {
          try {
            await this.db.query(
              `INSERT INTO saved_articles (title, description, url, source, category, date)
               SELECT $1, $2, $3, $4, $5, $6
               WHERE NOT EXISTS (SELECT 1 FROM saved_articles WHERE url = $3)`,
              [article.title, article.description, article.url, article.source || source.name, article.category || source.category, article.date]
            );
            totalFetched++;
          } catch { /* duplicate or DB error, skip */ }
        }
      } catch (e: any) {
        this.logger.warn(`Feed fetch failed for ${source.name}: ${e.message}`);
      }
    }

    // Buffer cleanup: keep only last 200 non-saved articles per source
    await this.db.query(`
      DELETE FROM saved_articles WHERE id IN (
        SELECT id FROM (
          SELECT id, ROW_NUMBER() OVER (PARTITION BY source ORDER BY created_at DESC) as rn
          FROM saved_articles WHERE saved = false AND archived = false
        ) ranked WHERE rn > 200
      )
    `);

    return { fetched: totalFetched, sources: sources.length };
  }

  async seedDefaultSources(): Promise<void> {
    const existing = await this.db.query('SELECT COUNT(*) as count FROM newsfeed_sources');
    if (parseInt(existing.rows[0].count) > 0) return;

    const defaults = [
      { name: 'Hacker News', url: 'https://hn.algolia.com/api/v1/search_by_date?tags=front_page', type: 'hackernews', category: 'Tech' },
      { name: 'BBC World', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', type: 'rss', category: 'World' },
      { name: 'BBC US/Canada', url: 'http://feeds.bbci.co.uk/news/world/us_and_canada/rss.xml', type: 'rss', category: 'US' },
      { name: 'Reuters World', url: 'https://feeds.reuters.com/Reuters/worldNews', type: 'rss', category: 'World' },
      { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss/all.xml', type: 'rss', category: 'World' },
      { name: 'DW News', url: 'https://rss.dw.com/rdf/rss-en-all', type: 'rss', category: 'World' },
      { name: 'NPR News', url: 'https://feeds.npr.org/1001/rss.xml', type: 'rss', category: 'US' },
      { name: 'CNBC Finance', url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', type: 'rss', category: 'Finance' },
      { name: 'Yahoo Finance', url: 'https://finance.yahoo.com/news/rssindex', type: 'rss', category: 'Finance' },
      { name: 'MarketWatch', url: 'https://feeds.marketwatch.com/marketwatch/topstories/', type: 'rss', category: 'Stocks' },
      { name: 'Bloomberg Markets', url: 'https://feeds.bloomberg.com/markets/news.rss', type: 'rss', category: 'Finance' },
      { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', type: 'rss', category: 'Tech' },
      { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', type: 'rss', category: 'Tech' },
      { name: 'Phys.org', url: 'https://phys.org/rss-feed/', type: 'rss', category: 'Science' },
      { name: 'Nature News', url: 'http://feeds.nature.com/nature/rss/current', type: 'rss', category: 'Science' },
      { name: 'New Scientist', url: 'https://www.newscientist.com/section/news/feed/', type: 'rss', category: 'Science' },
      { name: 'GEN Biotech', url: 'https://www.genengnews.com/feed/', type: 'rss', category: 'Biotech' },
      { name: 'BioSpace', url: 'https://www.biospace.com/rss/', type: 'rss', category: 'Biotech' },
      { name: 'Biohackers Magazine', url: 'https://biohackersmagazine.com/feed/', type: 'rss', category: 'Biotech' },
      { name: 'Google News Top', url: 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en', type: 'rss', category: 'All' },
      { name: 'Google News Science', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRFp0Y1RjU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', type: 'rss', category: 'Science' },
      { name: 'Google News Business', url: 'https://news.google.com/rss/topics/CAAqJggKIiBDQkFTRWdvSUwyMHZNRGx6TVdZU0FtVnVHZ0pWVXlnQVAB?hl=en-US&gl=US&ceid=US:en', type: 'rss', category: 'Finance' },
      { name: 'Ground News', url: 'https://ground.news/rss', type: 'rss', category: 'World' },
      { name: 'Finviz News', url: 'https://finviz.com/news.ashx', type: 'rss', category: 'Stocks' },
      { name: 'Benzinga', url: 'https://www.benzinga.com/feeds/rss', type: 'rss', category: 'Stocks' },
      { name: 'FRED Blog', url: 'https://fredblog.stlouisfed.org/feed/', type: 'rss', category: 'Finance' },
      { name: 'XYZ Science', url: 'https://xyzscience.com/feed/', type: 'rss', category: 'Science' },
    
    ];

    for (const src of defaults) {
      await this.db.query(
        'INSERT INTO newsfeed_sources (name, url, type, category, enabled) VALUES ($1, $2, $3, $4, true)',
        [src.name, src.url, src.type, src.category]
      );
    }
    this.logger.log(`Seeded ${defaults.length} default news sources`);
  }
  async cleanupOldArticles(daysOld: number = 7) {
    await this.db.query(
      `DELETE FROM saved_articles WHERE saved = false AND archived = false AND created_at < NOW() - INTERVAL '${daysOld} days'`
    );
    return { success: true };
  }

  async updateNewsSource(id: number, updates: any) {
    const fields: string[] = []; const values: any[] = []; let idx = 1;
    if (updates.enabled !== undefined) { fields.push(`enabled = $${idx++}`); values.push(updates.enabled); }
    if (updates.name !== undefined) { fields.push(`name = $${idx++}`); values.push(updates.name); }
    if (updates.url !== undefined) { fields.push(`url = $${idx++}`); values.push(updates.url); }
    if (updates.category !== undefined) { fields.push(`category = $${idx++}`); values.push(updates.category); }
    if (fields.length === 0) return null;
    values.push(id);
    const result = await this.db.query(`UPDATE newsfeed_sources SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
    return result.rows[0];
  }
}
