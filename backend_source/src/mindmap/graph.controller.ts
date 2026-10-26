// ============================================================
// 🧭 GRAPH ROUTES  (/api/mindmap/graph/...) — answered by Neo4j
// ============================================================
//   GET  /api/mindmap/graph/status
//   GET  /api/mindmap/graph/chain/:id?typeId=2&direction=before|after
//   GET  /api/mindmap/graph/path?from=1&to=9
//   GET  /api/mindmap/graph/neighbors/:id?depth=2
//   POST /api/mindmap/graph/rebuild          (copy everything to Neo4j again)
// ============================================================

import { Controller, Get, Post, Param, Query, Inject } from '@nestjs/common';
import { GraphService } from './graph.service';

@Controller('mindmap/graph')
export class GraphController {
  constructor(@Inject(GraphService) private readonly graph: GraphService) {}

  @Get('status')
  status() { return this.graph.status(); }

  @Get('chain/:id')
  chain(@Param('id') id: string, @Query('typeId') typeId: string, @Query('direction') direction: string) {
    return this.graph.chain(id, typeId, direction === 'after' ? 'after' : 'before');
  }

  @Get('path')
  path(@Query('from') from: string, @Query('to') to: string) { return this.graph.path(from, to); }

  @Get('neighbors/:id')
  neighbors(@Param('id') id: string, @Query('depth') depth: string) { return this.graph.neighbors(id, depth); }

  @Post('rebuild')
  async rebuild() {
    this.graph.markDirty();
    return { success: true };
  }
}