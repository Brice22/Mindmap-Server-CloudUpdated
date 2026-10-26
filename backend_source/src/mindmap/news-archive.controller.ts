// ============================================================
// 📰 NEWS — 💾 Keep a copy   (POST /api/mindmap/news/articles/:id/keep)
// ============================================================
import { Controller, Post, Param, Inject } from '@nestjs/common';
import { NewsArchiveService } from './news-archive.service';

@Controller('mindmap')
export class NewsArchiveController {
  constructor(@Inject(NewsArchiveService) private readonly news: NewsArchiveService) {}

  @Post('news/articles/:id/keep')
  keep(@Param('id') id: string) { return this.news.keepCopy(Number(id)); }
}