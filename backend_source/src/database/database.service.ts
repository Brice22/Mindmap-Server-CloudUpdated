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
        // Automatic backlinks: which text (doc, drawing, description, map pin) mentions which node
        `CREATE TABLE IF NOT EXISTS node_backlinks (
          id SERIAL PRIMARY KEY,
          target_node_id INTEGER NOT NULL REFERENCES mindmap_nodes(id) ON DELETE CASCADE,
          source_type TEXT NOT NULL,
          source_id INTEGER NOT NULL,
          source_node_id INTEGER REFERENCES mindmap_nodes(id) ON DELETE SET NULL,
          kind TEXT NOT NULL DEFAULT 'mention',
          snippet TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS idx_node_backlinks_target ON node_backlinks(target_node_id)`,
                `CREATE INDEX IF NOT EXISTS idx_node_backlinks_source ON node_backlinks(source_type, source_id)`,
        // 📍 places written in Docs with /place (shown on the Map)
        `CREATE TABLE IF NOT EXISTS doc_places (
          id SERIAL PRIMARY KEY,
          document_id INTEGER NOT NULL REFERENCES node_documents(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          lat DOUBLE PRECISION NOT NULL,
          lng DOUBLE PRECISION NOT NULL
        )`,
               `CREATE INDEX IF NOT EXISTS idx_doc_places_doc ON doc_places(document_id)`,
        // 🗑️ Trash: full copies of deleted nodes and documents, kept 30 days
        `CREATE TABLE IF NOT EXISTS trash (
          id SERIAL PRIMARY KEY,
          item_type TEXT NOT NULL,
          item_id INTEGER NOT NULL,
          title TEXT,
          data JSONB NOT NULL,
          deleted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
                // 📁 File library: everything in cloud_data (uploads, files saved from links, saved web pages)
        `CREATE TABLE IF NOT EXISTS files (
          id SERIAL PRIMARY KEY,
          path TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          mime TEXT,
          size BIGINT DEFAULT 0,
          node_id INTEGER REFERENCES mindmap_nodes(id) ON DELETE SET NULL,
          source_url TEXT,
          kind TEXT NOT NULL DEFAULT 'upload',
          document_id INTEGER REFERENCES node_documents(id) ON DELETE SET NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS idx_files_node ON files(node_id)`,
                // Text read from files (one row per PDF page / slide / sheet / part) — search + backlinks
        `ALTER TABLE files ADD COLUMN IF NOT EXISTS text_status TEXT`,
        `ALTER TABLE files ADD COLUMN IF NOT EXISTS text_pages INTEGER`,
        `CREATE TABLE IF NOT EXISTS file_texts (
          file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
          page INTEGER NOT NULL,
          text TEXT NOT NULL,
          PRIMARY KEY (file_id, page)
        )`,
                // OCR + video/audio copies (FFmpeg)
        `ALTER TABLE files ADD COLUMN IF NOT EXISTS ocr_at TIMESTAMP`,
        `ALTER TABLE files ADD COLUMN IF NOT EXISTS media_status TEXT`,
        `ALTER TABLE files ADD COLUMN IF NOT EXISTS media_info JSONB`,
        `ALTER TABLE files ADD COLUMN IF NOT EXISTS media_progress REAL`,
        `ALTER TABLE files ADD COLUMN IF NOT EXISTS play_path TEXT`,
        `ALTER TABLE files ADD COLUMN IF NOT EXISTS thumb_path TEXT`,
        `ALTER TABLE files ADD COLUMN IF NOT EXISTS small_path TEXT`,
        // Finished torrents already added to the file library
        `CREATE TABLE IF NOT EXISTS torrent_imports (
          hash TEXT PRIMARY KEY,
          name TEXT,
          file_ids INTEGER[] DEFAULT '{}',
          imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
                // Flashcards written in Docs: which document and block each one came from
               `ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS document_id INTEGER REFERENCES node_documents(id) ON DELETE CASCADE`,
        `ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS block_id TEXT`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_flashcards_doc_block ON flashcards(document_id, block_id)`,
        // 🔗 Your own links between any two nodes, each with a link type you name (colour, dashed, arrow).
        // The four starter types are only added the first time (rename or delete them freely).
        `DO $$ BEGIN
           IF to_regclass('public.link_types') IS NULL THEN
             CREATE TABLE link_types (
               id SERIAL PRIMARY KEY,
               name TEXT NOT NULL UNIQUE,
               color TEXT NOT NULL DEFAULT '#a855f7',
               dashed BOOLEAN NOT NULL DEFAULT true,
               arrow BOOLEAN NOT NULL DEFAULT false,
               description TEXT DEFAULT '',
               sort_order INTEGER NOT NULL DEFAULT 0,
               created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
             );
             INSERT INTO link_types (name, color, dashed, arrow, description, sort_order) VALUES
               ('Related',      '#a855f7', true,  false, 'Connected in some way',         1),
               ('Prerequisite', '#f59e0b', false, true,  'Learn this first, then that',   2),
               ('Causes',       '#ef4444', false, true,  'This leads to that',            3),
               ('Example of',   '#22c55e', true,  true,  'This is an example of that',    4);
           END IF;
         END $$`,
        `CREATE TABLE IF NOT EXISTS node_links (
          id SERIAL PRIMARY KEY,
          source_id INTEGER NOT NULL REFERENCES mindmap_nodes(id) ON DELETE CASCADE,
          target_id INTEGER NOT NULL REFERENCES mindmap_nodes(id) ON DELETE CASCADE,
          type_id INTEGER REFERENCES link_types(id) ON DELETE SET NULL,
          label TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CHECK (source_id <> target_id)
                )`,
        `CREATE INDEX IF NOT EXISTS idx_node_links_source ON node_links(source_id)`,
        `CREATE INDEX IF NOT EXISTS idx_node_links_target ON node_links(target_id)`,
        // 📰 News: when an article was read (read ones go a day later) and its saved copy (💾 Keep a copy)
        `ALTER TABLE saved_articles ADD COLUMN IF NOT EXISTS read_at TIMESTAMP`,
        `ALTER TABLE saved_articles ADD COLUMN IF NOT EXISTS copy_path TEXT`,
                `ALTER TABLE saved_articles ADD COLUMN IF NOT EXISTS copy_file_id INTEGER`,
        `ALTER TABLE saved_articles ADD COLUMN IF NOT EXISTS copy_document_id INTEGER`,
        `CREATE INDEX IF NOT EXISTS idx_saved_articles_url ON saved_articles(url)`,
        // 🧪 Question generator: each question's format, LLE cell (level × representation) and format details
        `ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'recall'`,
        `ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS lle_level SMALLINT`,
        `ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS lle_rep TEXT`,
        `ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS spec JSONB NOT NULL DEFAULT '{}'::jsonb`,
        `ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS solution TEXT`,
        // Every answer you give: right/wrong, how you rated it, and — when you missed — which mechanism failed
        `CREATE TABLE IF NOT EXISTS quiz_reviews (
          id SERIAL PRIMARY KEY,
          card_id INTEGER REFERENCES flashcards(id) ON DELETE CASCADE,
          node_id INTEGER,
          reviewed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          rating SMALLINT,
          correct BOOLEAN,
          mechanism TEXT,
          lle_level SMALLINT,
          lle_rep TEXT,
          seconds INTEGER,
                   response TEXT
        )`,
        `CREATE INDEX IF NOT EXISTS idx_quiz_reviews_node ON quiz_reviews(node_id, reviewed_at)`,
        // 🏷 Tags you make (name + colour); which nodes have them is in each node's metadata.tags
        `CREATE TABLE IF NOT EXISTS tags (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
                   color TEXT NOT NULL DEFAULT '#60a5fa',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        // ✨ Questions made from your map: the card remembers which (e.g. "prereq:12"); dismissed ones are listed apart
        `ALTER TABLE flashcards ADD COLUMN IF NOT EXISTS gen_key TEXT`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_flashcards_gen_key ON flashcards(gen_key) WHERE gen_key IS NOT NULL`,
        `CREATE TABLE IF NOT EXISTS quiz_dismissed (
          gen_key TEXT PRIMARY KEY,
          dismissed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        // 📚 Spaced chapter reviews: one row per review (the next one is added when you finish one)
        `CREATE TABLE IF NOT EXISTS chapter_reviews (
          id SERIAL PRIMARY KEY,
          chapter_id INTEGER NOT NULL REFERENCES mindmap_nodes(id) ON DELETE CASCADE,
          step INTEGER NOT NULL DEFAULT 0,
          due DATE NOT NULL,
          done_at TIMESTAMP,
          rating SMALLINT,
          recall TEXT,
          connections TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE INDEX IF NOT EXISTS idx_chapter_reviews_due ON chapter_reviews(due) WHERE done_at IS NULL`,
        // ✅ Today: your daily habits and the days you ticked them
        `CREATE TABLE IF NOT EXISTS daily_items (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          icon TEXT NOT NULL DEFAULT '✅',
          target_minutes INTEGER,
          sort_order INTEGER NOT NULL DEFAULT 0,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `INSERT INTO daily_items (name, icon, sort_order)
         SELECT * FROM (VALUES ('Spaced review', '🧪', 1), ('Drawing', '✏️', 2), ('Reading', '📖', 3),
                               ('Programming', '💻', 4), ('Article reading', '📰', 5)) AS v(name, icon, sort_order)
         WHERE NOT EXISTS (SELECT 1 FROM daily_items)`,
        `CREATE TABLE IF NOT EXISTS daily_checks (
          item_id INTEGER NOT NULL REFERENCES daily_items(id) ON DELETE CASCADE,
          day DATE NOT NULL,
          minutes INTEGER,
          note TEXT,
          PRIMARY KEY (item_id, day)
        )`,
        // Small settings (e.g. the daily review's new-per-day), one JSON value per key
        `CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        // Level-4 synthesis answers written at the end of a session
        `CREATE TABLE IF NOT EXISTS quiz_reflections (
          id SERIAL PRIMARY KEY,
          node_ids INTEGER[] NOT NULL DEFAULT '{}',
          prompt TEXT NOT NULL,
                   response TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        // 🔗 Linked banks (Teller) and Webull: one row per sign-in, its token encrypted
        `CREATE TABLE IF NOT EXISTS fin_links (
          id SERIAL PRIMARY KEY,
          provider TEXT NOT NULL,
          label TEXT,
          institution TEXT,
          external_id TEXT,
          token TEXT,
          status TEXT NOT NULL DEFAULT 'ok',
          last_sync TIMESTAMP,
          last_error TEXT,
          data JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `CREATE TABLE IF NOT EXISTS fin_accounts (
          id SERIAL PRIMARY KEY,
          link_id INTEGER REFERENCES fin_links(id) ON DELETE CASCADE,
          provider TEXT NOT NULL,
          external_id TEXT NOT NULL,
          name TEXT,
          institution TEXT,
          type TEXT,
          subtype TEXT,
          last_four TEXT,
          currency TEXT DEFAULT 'USD',
          status TEXT,
          balance_ledger DECIMAL(14,2),
          balance_available DECIMAL(14,2),
          balance_at TIMESTAMP,
          flip BOOLEAN NOT NULL DEFAULT false,
          raw JSONB,
          UNIQUE (provider, external_id)
        )`,
        `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual'`,
        `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS external_id TEXT`,
        `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS account_id INTEGER`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_ext ON transactions(source, external_id) WHERE external_id IS NOT NULL`,
        `ALTER TABLE investments ADD COLUMN IF NOT EXISTS external_id TEXT`,
        `ALTER TABLE investments ADD COLUMN IF NOT EXISTS account_name TEXT`,
        `ALTER TABLE investments ADD COLUMN IF NOT EXISTS market_value DECIMAL(14,2)`,
        `ALTER TABLE investments ADD COLUMN IF NOT EXISTS raw JSONB`,
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_investments_ext ON investments(source, external_id) WHERE external_id IS NOT NULL`,
        // ⌚ Garmin: one row per day from the garmin_sync container
        `CREATE TABLE IF NOT EXISTS garmin_daily (
          day DATE PRIMARY KEY,
          steps INTEGER,
          resting_hr INTEGER,
          stress_avg INTEGER,
          body_battery_high INTEGER,
          body_battery_low INTEGER,
          calories_total INTEGER,
          calories_active INTEGER,
          intensity_minutes INTEGER,
          sleep_seconds INTEGER,
          sleep_score INTEGER,
          hydration_ml INTEGER,
          food_calories INTEGER,
          protein_g REAL,
          carbs_g REAL,
          fat_g REAL,
          raw JSONB,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
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
