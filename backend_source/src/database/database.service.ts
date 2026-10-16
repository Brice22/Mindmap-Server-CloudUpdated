import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;
  
  // Explicitly define the property so there is no confusion
  private readonly configService: ConfigService;

  constructor(
    @Inject(ConfigService) configService: ConfigService  // <--- FORCE INJECTION HERE
  ) {
    this.configService = configService; // <--- MANUAL ASSIGNMENT
    
    // Debug Log: Prove that it arrived
    if (!this.configService) {
      this.logger.error('CRITICAL: ConfigService was NOT injected in constructor!');
    } else {
      this.logger.log('Constructor: ConfigService injected successfully.');
    }
  }

  async onModuleInit() {
    this.logger.log('Initializing Database Connection...');

    // Double check before crashing
    if (!this.configService) {
      this.logger.error('CRITICAL: configService is missing in onModuleInit');
      return; 
    }

    this.pool = new Pool({
      user: this.configService.get<string>('DB_USER'),
      host: this.configService.get<string>('BACKEND_DB_HOST') || 'postgres',
      database: this.configService.get<string>('DB_NAME') || 'postgres',
      password: this.configService.get<string>('DB_PASSWORD'),
      port: 5432,
    });

    try {
      await this.pool.query('SELECT NOW()');
      this.logger.log('✅ Database Connection Successful');
      
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS mindmap_nodes (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          metadata JSONB DEFAULT '{}',
          x INTEGER DEFAULT 0,
          y INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `;
      await this.pool.query(createTableQuery);
      this.logger.log('✅ Table "mindmap_nodes" is ready.');

     // ====================================================
      // ADD COLUMNS IF THEY DON'T EXIST (MIGRATION)
      // ====================================================
      // If the table already exists but is missing x/y columns,
      // this adds them without losing existing data.
      // ====================================================
      const addColumnsQuery = `
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'mindmap_nodes' AND column_name = 'x'
          ) THEN
            ALTER TABLE mindmap_nodes ADD COLUMN x INTEGER DEFAULT 0;
            ALTER TABLE mindmap_nodes ADD COLUMN y INTEGER DEFAULT 0;
          END IF;
        END $$;
      `;
      await this.pool.query(addColumnsQuery);
      this.logger.log('✅ Columns x, y verified.');

      // Create additional tables
      const additionalTables = [
        `CREATE TABLE IF NOT EXISTS bookmarks (
          id SERIAL PRIMARY KEY,
          node_id INTEGER REFERENCES mindmap_nodes(id) ON DELETE CASCADE,
          node_name TEXT NOT NULL,
          color TEXT,
          group_name TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS calendar_events (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          start_time TEXT NOT NULL,
          end_time TEXT,
          node_id INTEGER,
          color TEXT,
          done BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS transactions (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          amount DECIMAL(12,2) NOT NULL,
          category TEXT DEFAULT 'Other',
          date TEXT NOT NULL,
          type TEXT CHECK(type IN ('income', 'expense')) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS investments (
          id SERIAL PRIMARY KEY,
          symbol TEXT NOT NULL,
          shares DECIMAL(12,6) NOT NULL,
          buy_price DECIMAL(12,2) NOT NULL,
          current_price DECIMAL(12,2) NOT NULL,
          source TEXT DEFAULT 'manual',
          type TEXT DEFAULT 'stock',
          date TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS health_entries (
          id SERIAL PRIMARY KEY,
          date TEXT NOT NULL,
          type TEXT NOT NULL,
          value DECIMAL(10,2) NOT NULL,
          value2 DECIMAL(10,2),
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS flashcards (
          id SERIAL PRIMARY KEY,
          question TEXT NOT NULL,
          answer TEXT NOT NULL,
          node_id INTEGER,
          node_name TEXT,
          difficulty TEXT DEFAULT 'medium',
          interval_days INTEGER DEFAULT 0,
          ease_factor DECIMAL(4,2) DEFAULT 2.5,
          next_review TEXT,
          review_count INTEGER DEFAULT 0,
          last_review TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS mindmap_collections (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          icon TEXT DEFAULT '📋',
          description TEXT,
          node_ids INTEGER[] DEFAULT '{}',
          color TEXT,
          map_overlay JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS newsfeed_sources (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          type TEXT DEFAULT 'rss',
          api_key TEXT,
          category TEXT DEFAULT 'All',
          enabled BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS saved_articles (
          id SERIAL PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          url TEXT NOT NULL,
          source TEXT,
          category TEXT,
          date TEXT,
          read BOOLEAN DEFAULT false,
          archived BOOLEAN DEFAULT false,
          saved BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS node_documents (
          id SERIAL PRIMARY KEY,
          node_id INTEGER REFERENCES mindmap_nodes(id) ON DELETE SET NULL,
          group_name TEXT DEFAULT 'General',
          title TEXT NOT NULL DEFAULT 'Untitled',
          content JSONB DEFAULT '[]'::jsonb,
          sort_order INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS idx_node_documents_node ON node_documents(node_id)`,
        // Shared library: deleting a node keeps its documents (node_id becomes NULL = "Unfiled").
        // Upgrades tables created before this change (they deleted documents with the node).
        `DO $$
         BEGIN
           IF EXISTS (SELECT 1 FROM pg_constraint
                      WHERE conname = 'node_documents_node_id_fkey' AND confdeltype = 'c') THEN
             ALTER TABLE node_documents DROP CONSTRAINT node_documents_node_id_fkey;
             ALTER TABLE node_documents ALTER COLUMN node_id DROP NOT NULL;
             ALTER TABLE node_documents ADD CONSTRAINT node_documents_node_id_fkey
               FOREIGN KEY (node_id) REFERENCES mindmap_nodes(id) ON DELETE SET NULL;
           END IF;
         END $$`,
        // Other nodes that link to a document (besides its home node)
        `CREATE TABLE IF NOT EXISTS node_document_links (
          node_id INTEGER NOT NULL REFERENCES mindmap_nodes(id) ON DELETE SET NULL,
          document_id INTEGER NOT NULL REFERENCES node_documents(id) ON DELETE CASCADE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (node_id, document_id)
        )`,
        `CREATE INDEX IF NOT EXISTS idx_node_document_links_doc ON node_document_links(document_id)`,
      ];

      for (const sql of additionalTables) {
        await this.pool.query(sql);
      }
      this.logger.log('✅ All tables ready.');

    } catch (e) {
      this.logger.error('❌ Database Connection Failed', e);
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  async query(text: string, params?: any[]): Promise<QueryResult> {
    return this.pool.query(text, params);
  }
}
