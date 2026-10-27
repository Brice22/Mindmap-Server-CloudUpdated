// ============================================================
// 🏷 TAG ROUTES  (/api/mindmap/tags)
// ============================================================
//   GET    /api/mindmap/tags          [{ id, name, color, nodes }]
//   POST   /api/mindmap/tags          { name, color }
//   PUT    /api/mindmap/tags/:id      { name?, color? }   (renames it on every node)
//   DELETE /api/mindmap/tags/:id      (removes it from every node)
// Which tags a node has: PUT /api/mindmap/node/:id  { metadata: { tags: [...] } }
// ============================================================
import { Controller, Get, Post, Put, Delete, Param, Body, Inject } from '@nestjs/common';
import { TagsService } from './tags.service';

@Controller('mindmap/tags')
export class TagsController {
  constructor(@Inject(TagsService) private readonly tags: TagsService) {}

  @Get()
  list() { return this.tags.list(); }

  @Post()
  create(@Body() body: any) { return this.tags.create(body || {}); }

  @Put(':id')
  update(@Param('id') id: string, @Body() body: any) { return this.tags.update(Number(id), body || {}); }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.tags.remove(Number(id)); }
}