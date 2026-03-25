import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MindsDBService implements OnModuleInit {
  private readonly logger = new Logger(MindsDBService.name);
  private baseUrl: string;
  private connected = false;

  constructor(private config: ConfigService) {
    this.baseUrl = 'http://mindsdb:47334/api';
  }

  async onModuleInit() {
    try {
      const res = await fetch(`${this.baseUrl}/status`);
      if (res.ok) {
        this.connected = true;
        this.logger.log('MindsDB connection successful');
        await this.setupModels();
      }
    } catch (e: any) {
      this.logger.warn('MindsDB not available: ' + e.message);
    }
  }

  private async setupModels() {
    try {
      // Connect MindsDB to your PostgreSQL
      await this.runSQL(`
        CREATE DATABASE IF NOT EXISTS pg_mindmap
        WITH ENGINE = 'postgres',
        PARAMETERS = {
          "host": "postgres",
          "port": "5432",
          "user": "${this.config.get('DB_USER') || 'sylar546'}",
          "password": "${this.config.get('DB_PASSWORD') || ''}",
          "database": "${this.config.get('DB_NAME') || 'hserver_master'}"
        };
      `);
      this.logger.log('MindsDB connected to PostgreSQL');
    } catch (e: any) {
      this.logger.warn('MindsDB model setup deferred: ' + e.message);
    }
  }

  async runSQL(sql: string) {
    if (!this.connected) return null;

    try {
      const res = await fetch(`${this.baseUrl}/sql/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sql }),
      });
      return await res.json();
    } catch (e: any) {
      this.logger.error('MindsDB query failed: ' + e.message);
      return null;
    }
  }

  // Generate quiz questions from a node's content
  async generateQuiz(nodeName: string, nodeDescription: string): Promise<any> {
    return await this.runSQL(`
      SELECT answer FROM mindsdb.quiz_model
      WHERE text = 'Generate 5 flashcard questions and answers about: ${nodeName}. Context: ${nodeDescription.replace(/'/g, "\\'")}';
    `);
  }

  // Auto-suggest tags for a node
  async suggestTags(name: string, description: string): Promise<string[]> {
    const result = await this.runSQL(`
      SELECT answer FROM mindsdb.tagger_model
      WHERE text = 'List 5 single-word tags for: ${name}. ${description.replace(/'/g, "\\'")}. Return only comma-separated words.';
    `);

    if (!result?.data?.[0]?.answer) return [];
    return result.data[0].answer.split(',').map((t: string) => t.trim().toLowerCase());
  }

  // Suggest related nodes
  async suggestRelationships(nodeName: string): Promise<any> {
    return await this.runSQL(`
      SELECT name, description FROM pg_mindmap.mindmap_nodes
      WHERE name != '${nodeName.replace(/'/g, "\\'")}'
      ORDER BY description LIMIT 5;
    `);
  }
}