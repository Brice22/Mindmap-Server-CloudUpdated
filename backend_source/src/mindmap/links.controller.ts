// ============================================================
// LINK ROUTES  (/api/mindmap/links, /api/mindmap/link-types)
// ============================================================
//   GET    /api/mindmap/links              { types, links } for the graph
//   POST   /api/mindmap/links              { sourceId, targetId, typeId, label }
//   PUT    /api/mindmap/links/:id          { typeId?, label?, reverse? }
//   DELETE /api/mindmap/links/:id
//   POST   /api/mindmap/link-types         { name, color, dashed, arrow, description }
//   PUT    /api/mindmap/link-types/:id     any of those
//   DELETE /api/mindmap/link-types/:id     its links stay, as "No type"
// ============================================================

import { Controller, Get, Post, Put, Delete, Param, Body, Inject } from '@nestjs/common';
import { LinksService } from './links.service';

@Controller('mindmap')
export class LinksController {
  constructor(@Inject(LinksService) private readonly links: LinksService) {}

  @Get('links')
  all() { return this.links.all(); }

  @Post('links')
  create(@Body() body: any) { return this.links.createLink(body || {}); }

  @Put('links/:id')
  update(@Param('id') id: string, @Body() body: any) { return this.links.updateLink(Number(id), body || {}); }

  @Delete('links/:id')
  remove(@Param('id') id: string) { return this.links.deleteLink(Number(id)); }

  @Post('link-types')
  createType(@Body() body: any) { return this.links.createType(body || {}); }

  @Put('link-types/:id')
  updateType(@Param('id') id: string, @Body() body: any) { return this.links.updateType(Number(id), body || {}); }

  @Delete('link-types/:id')
  removeType(@Param('id') id: string) { return this.links.deleteType(Number(id)); }
}