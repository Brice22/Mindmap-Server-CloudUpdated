import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SurrealService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SurrealService.name);
  private ws: any = null;
  private connected = false;
  private surrealUrl: string;

  constructor(private config: ConfigService) {
    this.surrealUrl = this.config.get('SURREALDB_URL') || 'http://surrealdb:8000/rpc';
  }

  async onModuleInit() {
    try {
      // Test connection with a simple query
      const res = await fetch(this.surrealUrl.replace('/rpc', '/health'));
      if (res.ok) {
        this.connected = true;
        this.logger.log('SurrealDB connection successful');

        // Create embeddings table
        await this.query(`
          DEFINE TABLE node_embeddings SCHEMAFULL;
          DEFINE FIELD node_id ON node_embeddings TYPE int;
          DEFINE FIELD name ON node_embeddings TYPE string;
          DEFINE FIELD description ON node_embeddings TYPE string;
          DEFINE FIELD embedding ON node_embeddings TYPE array;
          DEFINE FIELD tags ON node_embeddings TYPE array;
          DEFINE INDEX idx_node_id ON node_embeddings FIELDS node_id UNIQUE;
        `);
      }
    } catch (e: any) {
      this.logger.warn('SurrealDB not available: ' + e.message);
    }
  }

  async onModuleDestroy() {
    this.connected = false;
  }

  async query(sql: string, vars?: any) {
    if (!this.connected) return null;

    try {
      const res = await fetch(this.surrealUrl.replace('/rpc', '/sql'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'NS': 'hserver',
          'DB': 'mindmap',
          'Authorization': 'Basic ' + Buffer.from('root:root').toString('base64'),
        },
        body: sql,
      });
      return await res.json();
    } catch (e: any) {
      this.logger.error('SurrealDB query failed: ' + e.message);
      return null;
    }
  }

  // Store node embedding for semantic search
  async upsertNodeEmbedding(nodeId: number, name: string, description: string, tags: string[]) {
    await this.query(`
      DELETE FROM node_embeddings WHERE node_id = ${nodeId};
      CREATE node_embeddings SET
        node_id = ${nodeId},
        name = '${name.replace(/'/g, "\\'")}',
        description = '${description.replace(/'/g, "\\'")}',
        tags = [${tags.map(t => `'${t}'`).join(',')}];
    `);
  }

  // Find similar nodes by tags
  async findSimilar(tags: string[], limit: number = 10) {
    const tagFilter = tags.map(t => `tags CONTAINS '${t}'`).join(' OR ');
    return await this.query(
      `SELECT * FROM node_embeddings WHERE ${tagFilter} LIMIT ${limit}`
    );
  }
}