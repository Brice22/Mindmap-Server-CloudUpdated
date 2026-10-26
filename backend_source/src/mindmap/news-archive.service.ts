// ============================================================
// 📰 NEWS STOCKPILE - fetched by the server, kept until you read it
// ============================================================
// - Every hour (NEWS_FETCH_MINUTES) the server fetches all enabled
//   sources, even when the app isn't open. Unread articles are never
//   trimmed: they wait for you.
// - Read articles leave a day after you read them — unless you ★ save,
//   archive or keep a copy of them (mindmap.service.ts cleanupOldArticles).
// - 💾 Keep a copy: the server downloads the article the same way
//   🌐 Save link does — a readable document (Docs → group "News"), an
//   offline copy of the page with its pictures, all in the Files library —
//   and marks the article ★ so it stays.
//   Some sites block servers or show only a paywall; for those, open the
//   article and use the 📌 Send to HServer browser button instead
//   (it saves the page exactly as you see it).
// ============================================================

import { Injectable, Inject, Logger, OnModuleInit, OnModuleDestroy, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { MindmapService } from './mindmap.service';
import { WebClipService } from './web-clip.service';

const EVERY_MINUTES = Math.max(10, Number(process.env.NEWS_FETCH_MINUTES) || 60);

@Injectable()
export class NewsArchiveService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NewsArchiveService.name);
  private timer: any;
  private first: any;
  private running = false;

  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(MindmapService) private readonly mindmap: MindmapService,
    @Inject(WebClipService) private readonly clips: WebClipService,
  ) {}

  onModuleInit() {
    this.first = setTimeout(() => this.fetchNow(), 2 * 60_000);          // 2 minutes after startup
    this.timer = setInterval(() => this.fetchNow(), EVERY_MINUTES * 60_000);
  }

  onModuleDestroy() {
    clearTimeout(this.first);
    clearInterval(this.timer);
  }

  private async fetchNow() {
    if (this.running) return;
    this.running = true;
    try {
      const r = await this.mindmap.fetchAllFeeds();
      this.logger.log(`News: checked ${r.sources} sources, ${r.fetched} new articles`);
    } catch (e: any) {
      this.logger.warn(`News fetch failed: ${e?.message || e}`);
    } finally {
      this.running = false;
    }
  }

  // 💾 Download the article into the library and keep it
  async keepCopy(id: number) {
    const article = (await this.db.query('SELECT * FROM saved_articles WHERE id = $1', [id])).rows[0];
    if (!article) throw new NotFoundException('That article is gone');
    if (article.copy_path) return article;                       // already kept

    const result = await this.clips.saveLink(article.url, { title: article.title, groupName: 'News' });
    const copyPath = result.kind === 'page'
      ? result.file.path.replace(/page\.html$/, 'article.html')   // the clean, readable copy
      : result.file.path;                                         // a PDF or other file
    const res = await this.db.query(
      `UPDATE saved_articles
       SET saved = true, copy_path = $2, copy_file_id = $3, copy_document_id = $4
       WHERE id = $1 RETURNING *`,
      [id, copyPath, result.file?.id ?? null, result.kind === 'page' ? result.document?.id ?? null : null],
    );
    this.logger.log(`News: kept a copy of "${article.title}"`);
    return res.rows[0];
  }
}