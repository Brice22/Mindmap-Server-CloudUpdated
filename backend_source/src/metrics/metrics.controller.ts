import { Controller, Get, Res } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';

@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Public()
  @Get()
  async getMetrics(@Res() res: Response) {
    const metrics = await this.metrics.getMetrics();
    res.set('Content-Type', this.metrics.getContentType());
    res.send(metrics);
  }
}