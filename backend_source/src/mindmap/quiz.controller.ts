// ============================================================
// 🧪 QUESTION GENERATOR ROUTES  (/api/mindmap/quiz/...)
// ============================================================
//   POST /quiz/questions            new question (any format, LLE tag)
//   PUT  /quiz/questions/:id        change it (Doc cards: format + LLE tag only)
//   POST /quiz/reviews              log an answer (rating, right/wrong, mechanism)
//   GET  /quiz/coverage?nodeIds=1,2 LLE chart data for those nodes (all if empty)
//   POST /quiz/reflections          save a Level-4 synthesis answer
//   GET  /quiz/reflections?nodeId=  past synthesis answers
// ✨ Questions made from your map (descriptions, sub-nodes, links, lesson plans):
//   GET  /quiz/suggestions?nodeIds=&dismissed=1   not kept yet (+ dismissed ones)
//   POST /quiz/suggestions/keep     { keys }  → cards in your decks
//   POST /quiz/suggestions/dismiss  { keys }  → hidden (and out of your decks)
//   POST /quiz/suggestions/restore  { keys }  → back in the tray
//   POST /quiz/generated/refresh             kept ones follow changes to the map
// Spaced repetition updates still go through PUT /flashcards/:id.
// ============================================================

import { Controller, Get, Post, Put, Param, Body, Query, Inject } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { QuizGenService } from './quiz-gen.service';

@Controller('mindmap/quiz')
export class QuizController {
  constructor(
    @Inject(QuizService) private readonly quiz: QuizService,
    @Inject(QuizGenService) private readonly gen: QuizGenService,
  ) {}

  @Post('questions')
  create(@Body() body: any) { return this.quiz.createQuestion(body || {}); }

  @Put('questions/:id')
  update(@Param('id') id: string, @Body() body: any) { return this.quiz.updateQuestion(Number(id), body || {}); }

  @Post('reviews')
  review(@Body() body: any) { return this.quiz.logReview(body || {}); }

  @Get('coverage')
  coverage(@Query('nodeIds') nodeIds?: string) { return this.quiz.coverage(nodeIds); }

   @Post('reflections')
  reflect(@Body() body: any) { return this.quiz.saveReflection(body || {}); }

  @Get('export')
  exportData(@Query('nodeIds') nodeIds?: string, @Query('days') days?: string) { return this.quiz.exportData(nodeIds, days); }

  @Get('daily')
  daily() { return this.quiz.daily(); }

   @Put('settings')
  saveSettings(@Body() body: any) { return this.quiz.saveSettings(body || {}); }

  @Get('suggestions')
  suggestions(@Query('nodeIds') nodeIds?: string, @Query('dismissed') dismissed?: string) {
    return this.gen.suggestions(nodeIds, dismissed === '1');
  }

  @Post('suggestions/keep')
  keep(@Body() body: any) { return this.gen.keep(body?.keys); }

  @Post('suggestions/dismiss')
  dismiss(@Body() body: any) { return this.gen.dismiss(body?.keys); }

  @Post('suggestions/restore')
  restore(@Body() body: any) { return this.gen.restore(body?.keys); }

  @Post('generated/refresh')
  refreshGenerated() { return this.gen.refresh(); }

  @Get('reflections')
  reflections(@Query('nodeId') nodeId?: string) { return this.quiz.reflections(nodeId); }
}