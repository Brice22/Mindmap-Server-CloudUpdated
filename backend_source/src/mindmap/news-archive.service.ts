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

// "06:00" → [6, 0]; anything odd → 6:00
function fetchTime(): [number, number] {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(process.env.NEWS_FETCH_TIME || '06:00').trim());
  const h = m ? Number(m[1]) : 6, min = m ? Number(m[2]) : 0;
  return h < 24 && min < 60 ? [h, min] : [6, 0];
}
const DAY_MS = 24 * 60 * 60 * 1000;

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
    // Catch up 2 minutes after startup if nothing new arrived in the last day (e.g. the server was off at fetch time)
    this.first = setTimeout(async () => {
      try {
        const r = await this.db.query('SELECT MAX(created_at) AS last FROM saved_articles');
        const last = r.rows[0]?.last ? new Date(r.rows[0].last).getTime() : 0;
        if (Date.now() - last > DAY_MS) await this.fetchNow();
      } catch {}
    }, 2 * 60_000);
    this.scheduleNext();
  }

  onModuleDestroy() {
    clearTimeout(this.first);
    clearTimeout(this.timer);
  }

  // Next NEWS_FETCH_TIME (today if it's still ahead, otherwise tomorrow)
  private scheduleNext() {
    const [h, m] = fetchTime();
    const next = new Date();
    next.setHours(h, m, 0, 0);
    if (next.getTime() <= Date.now() + 1000) next.setDate(next.getDate() + 1);
    clearTimeout(this.timer);
    this.timer = setTimeout(async () => { await this.fetchNow(); this.scheduleNext(); }, next.getTime() - Date.now());
    this.logger.log(`News: next fetch ${next.toLocaleString()}`);
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