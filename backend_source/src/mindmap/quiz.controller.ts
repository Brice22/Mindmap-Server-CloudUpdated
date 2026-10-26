// ============================================================
// 🧪 QUESTION GENERATOR ROUTES  (/api/mindmap/quiz/...)
// ============================================================
//   POST /quiz/questions            new question (any format, LLE tag)
//   PUT  /quiz/questions/:id        change it (Doc cards: format + LLE tag only)
//   POST /quiz/reviews              log an answer (rating, right/wrong, mechanism)
//   GET  /quiz/coverage?nodeIds=1,2 LLE chart data for those nodes (all if empty)
//   POST /quiz/reflections          save a Level-4 synthesis answer
//   GET  /quiz/reflections?nodeId=  past synthesis answers
// Spaced repetition updates still go through PUT /flashcards/:id.
// ============================================================

import { Controller, Get, Post, Put, Param, Body, Query, Inject } from '@nestjs/common';
import { QuizService } from './quiz.service';

@Controller('mindmap/quiz')
export class QuizController {
  constructor(@Inject(QuizService) private readonly quiz: QuizService) {}

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

  @Get('reflections')
  reflections(@Query('nodeId') nodeId?: string) { return this.quiz.reflections(nodeId); }
}