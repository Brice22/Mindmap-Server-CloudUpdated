// ============================================================
// REGIONS + TORRENTS routes  (/api/mindmap/regions, /api/mindmap/torrents)
// ============================================================

import { Controller, Get, Post, Delete, Param, Body, Query, Inject, UseInterceptors, UploadedFile } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import * as os from 'os';
import { RegionsService } from './regions.service';
import { TorrentsService } from './torrents.service';

@Controller('mindmap')
export class NetworkController {
  constructor(
    @Inject(RegionsService) private readonly regions: RegionsService,
    @Inject(TorrentsService) private readonly torrents: TorrentsService,
  ) {}

  // 🌍 Regions (gluetun containers): status, public IP, proxy addresses
  @Get('regions')
  listRegions() { return this.regions.list(); }

  // Reconnect a region to another server in the same country
  @Post('regions/:id/new-server')
  newServer(@Param('id') id: string) { return this.regions.newServer(id); }

  // ⬇ Torrents
  @Get('torrents/status')
  torrentStatus() { return this.torrents.status(); }

  @Get('torrents')
  listTorrents() { return this.torrents.list(); }

  // Magnet link(s) in "urls", or a .torrent file in "file"; optional nodeId
  @Post('torrents')
  @UseInterceptors(FileInterceptor('file', { dest: os.tmpdir(), limits: { fileSize: 10 * 1024 * 1024 } }))
  addTorrent(@Body() body: any, @UploadedFile() file?: Express.Multer.File) {
    const nodeId = body?.nodeId ? Number(body.nodeId) : null;
    return this.torrents.add({ urls: body?.urls, file, nodeId });
  }

  @Post('torrents/:hash/pause')
  pause(@Param('hash') hash: string) { return this.torrents.pause(hash); }

  @Post('torrents/:hash/resume')
  resume(@Param('hash') hash: string) { return this.torrents.resume(hash); }

  // ?files=true also deletes the downloaded files (to the Trash)
  @Delete('torrents/:hash')
  remove(@Param('hash') hash: string, @Query('files') files?: string) { return this.torrents.remove(hash, files === 'true'); }
}