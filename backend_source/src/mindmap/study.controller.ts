// ============================================================
// 📚 STUDY ROUTES  (/api/mindmap/study/...)
// ============================================================
//   🪜 LLE ladder
//   GET  /study/lle-notes/:nodeId         what's written in each cell
//   POST /study/lle-notes                 { nodeId, level, rep, text } → into the "🪜 LLE notes" doc
//   📝 Summaries
//   GET  /study/summary/:nodeId           the "📝 Summary" doc as text
//   POST /study/summary/:nodeId           { text } → added to it
//   📚 Library
//   GET  /study/library?day=              books, chapters, files, cards, next reviews
//   POST /study/books                     { name, author, totalPages, chapters, status }
//   POST /study/books/:id/chapters        { name, number, startPage, endPage }
//   POST /study/chapters/:id/finish       { finished, day } → schedules reviews
//   GET  /study/chapters/:id/reviews      past reviews
//   GET  /study/reviews/due?day=          chapter reviews due
//   POST /study/reviews/:id/complete      { rating 1–4, recall, connections, day }
//   ✅ Today
//   GET  /study/today?from=&to=           habits, ticks, articles read today
//   POST /study/today/items               { name, icon, targetMinutes }
//   PUT  /study/today/items/:id           { name, icon, active, sortOrder, targetMinutes }
//   PUT  /study/today/checks              { itemId, day, done, minutes, note }
// ============================================================
import { Controller, Get, Post, Put, Param, Body, Query, Inject } from '@nestjs/common';
import { StudyService } from './study.service';

@Controller('mindmap/study')
export class StudyController {
  constructor(@Inject(StudyService) private readonly study: StudyService) {}

  @Get('lle-notes/:nodeId')
  lleNotes(@Param('nodeId') nodeId: string) { return this.study.lleNotes(nodeId); }

  @Post('lle-notes')
  addLleNote(@Body() body: any) { return this.study.addLleNote(body || {}); }

  @Get('summary/:nodeId')
  summary(@Param('nodeId') nodeId: string) { return this.study.summary(nodeId); }

  @Post('summary/:nodeId')
  addSummary(@Param('nodeId') nodeId: string, @Body() body: any) { return this.study.addSummary(nodeId, body || {}); }

  @Get('library')
  library(@Query('day') day?: string) { return this.study.library(day); }

  @Post('books')
  addBook(@Body() body: any) { return this.study.addBook(body || {}); }

  @Post('books/:id/chapters')
  addChapter(@Param('id') id: string, @Body() body: any) { return this.study.addChapter(id, body || {}); }

  @Post('chapters/:id/finish')
  finish(@Param('id') id: string, @Body() body: any) { return this.study.finishChapter(id, body || {}); }

  @Get('chapters/:id/reviews')
  history(@Param('id') id: string) { return this.study.reviewHistory(id); }

  @Get('reviews/due')
  due(@Query('day') day?: string) { return this.study.dueReviews(day); }

  @Post('reviews/:id/complete')
  complete(@Param('id') id: string, @Body() body: any) { return this.study.completeReview(id, body || {}); }

  @Get('today')
  today(@Query('from') from?: string, @Query('to') to?: string) { return this.study.today(from, to); }

  @Post('today/items')
  addItem(@Body() body: any) { return this.study.addItem(body || {}); }

  @Put('today/items/:id')
  updateItem(@Param('id') id: string, @Body() body: any) { return this.study.updateItem(id, body || {}); }

  @Put('today/checks')
  setCheck(@Body() body: any) { return this.study.setCheck(body || {}); }
}