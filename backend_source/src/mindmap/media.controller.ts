// ============================================================
// MEDIA routes  (/api/mindmap/media/..., /api/mindmap/files/:id/media/...)
// ============================================================

import { Controller, Get, Post, Param, Inject } from '@nestjs/common';
import { MediaService } from './media.service';

@Controller('mindmap')
export class MediaController {
  constructor(@Inject(MediaService) private readonly media: MediaService) {}

  // Which helper programs are installed (ffmpeg, tesseract)
  @Get('media/status')
  status() { return this.media.status(); }

  // 📶 Make a 720p copy for watching away from home
  @Post('files/:id/media/small')
  small(@Param('id') id: string) { return this.media.requestSmall(Number(id)); }

  // Try converting again (after a failure)
  @Post('files/:id/media/retry')
  retry(@Param('id') id: string) { return this.media.retry(Number(id)); }
}