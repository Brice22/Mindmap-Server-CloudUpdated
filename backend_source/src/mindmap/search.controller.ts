// ============================================================
// SEARCH routes  (/api/mindmap/search/...)
// ============================================================

import { Controller, Get, Post, Param, Query, Inject } from '@nestjs/common';
import { SearchService } from './search.service';
import { FileTextService } from './file-text.service';

@Controller('mindmap')
export class SearchController {
  constructor(
    @Inject(SearchService) private readonly search: SearchService,
    @Inject(FileTextService) private readonly fileText: FileTextService,
  ) {}

  // Nodes, documents and files (text inside PDFs, Word, slides, …) in one list
  @Get('search/everything')
  everything(@Query('q') q: string, @Query('kind') kind?: string, @Query('nodeId') nodeId?: string, @Query('limit') limit?: string) {
    return this.search.search(q, { kind, nodeId: nodeId ? Number(nodeId) : undefined, limit: limit ? Number(limit) : undefined });
  }

  // Which engine is answering (meilisearch / postgres) and how many entries it has
  @Get('search/status')
  status() { return this.search.status(); }

  // Rebuild the MeiliSearch index from the database
  @Post('search/reindex')
  reindex() { return this.search.reindexAll(); }

  // Read a file's text again (e.g. after replacing it)
  @Post('files/:id/reread')
  async reread(@Param('id') id: string) {
    await this.fileText.readFile(Number(id));
    return { success: true };
  }
}