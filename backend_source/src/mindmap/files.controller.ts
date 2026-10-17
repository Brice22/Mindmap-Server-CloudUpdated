// ============================================================
// FILES + SAVED WEB PAGES routes  (/api/mindmap/files, /api/mindmap/clip)
// ============================================================

import { Controller, Get, Post, Put, Delete, Param, Body, Query, Inject, Res, Req,
  UseInterceptors, UploadedFile, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import type { Request, Response } from 'express';
import { FilesService } from './files.service';
import { WebClipService } from './web-clip.service';
import { absPath, monthFolder, randomId, relPath, safeName } from './uploads';

const toId = (v: any) => (v === undefined || v === null || v === '' || v === 'null' ? null : Number(v));
// multer reads file names as latin1; turn them back into proper UTF-8
const realName = (name: string) => Buffer.from(name, 'latin1').toString('utf8');
const esc = (s: string) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

@Controller('mindmap')
export class FilesController {
  constructor(
    @Inject(FilesService) private readonly files: FilesService,
    @Inject(WebClipService) private readonly clips: WebClipService,
  ) {}

  // === 📁 FILE LIBRARY ===
  @Get('files')
  list(@Query('search') search?: string, @Query('nodeId') nodeId?: string, @Query('type') type?: string, @Query('limit') limit?: string) {
    return this.files.list({ search, nodeId: toId(nodeId) || undefined, type, limit: Number(limit) || undefined });
  }

  // Upload into files/<year-month>/ (field "file"; optional "nodeId")
  @Post('files')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const folder = monthFolder('files');
        try { fs.mkdirSync(absPath(folder), { recursive: true }); cb(null, absPath(folder)); } catch (e: any) { cb(e, ''); }
      },
      filename: (req, file, cb) => cb(null, `${randomId()}-${safeName(realName(file.originalname))}`),
    }),
  }))
  async upload(@UploadedFile() file: Express.Multer.File, @Body() body: any) {
    if (!file) throw new BadRequestException('No file was sent');
    return this.files.register({
      path: relPath(file.path),
      name: realName(file.originalname),
      mime: file.mimetype,
      size: file.size,
      nodeId: toId(body?.nodeId),
      kind: 'upload',
    });
  }

  @Post('files/scan')
  scan() { return this.files.scan(); }

  @Put('files/:id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.files.update(Number(id), { name: body?.name, nodeId: body?.nodeId === undefined ? undefined : toId(body.nodeId) });
  }

  @Delete('files/:id')
  remove(@Param('id') id: string) { return this.files.remove(Number(id)); }

  // === 🌐 SAVE A LINK (web page → document, anything else → file) ===
  @Post('clip')
  saveLink(@Body() body: any) {
    return this.clips.saveLink(body?.url, { nodeId: toId(body?.nodeId), groupName: body?.groupName });
  }

  // === 📌 "Send to HServer" browser button ===
  // The button posts the page you are looking at (url, title, html, node name) as a form,
  // so it works from any site; the answer is a small page saying what happened.
  @Post('clip/page')
  async savePage(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const wantsJson = String(req.headers['content-type'] || '').includes('application/json');
    try {
      const node = await this.clips.findNodeByName(body?.node);
      const result = await this.clips.savePage(String(body?.html || ''), String(body?.url || ''), {
        nodeId: node?.id ?? toId(body?.nodeId),
        title: body?.title ? String(body.title) : undefined,
      });
      if (wantsJson) return res.json(result);
      const where = node ? `in <b>${esc(node.name)}</b>` : body?.node ? `as Unfiled (no node called “${esc(body.node)}”)` : 'as Unfiled';
      return res.type('html').send(this.answerPage('✓ Saved',
        `<p>“${esc(result.document.title)}” was saved ${where}.</p>
         <p>${result.images.saved} of ${result.images.found} pictures copied.</p>
         <p><a href="/uploads/${result.file.path.split('/').map(encodeURIComponent).join('/').replace(/page\.html$/, 'article.html')}">Open the offline copy</a></p>
         <p style="color:#888">You can close this tab.</p>`));
    } catch (e: any) {
      const message = e?.response?.message || e?.message || 'Something went wrong';
      if (wantsJson) return res.status(400).json({ message });
      return res.status(400).type('html').send(this.answerPage('✗ Not saved', `<p>${esc(message)}</p>`));
    }
  }

  private answerPage(title: string, body: string) {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)} — HServer</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{background:#1e1e2e;color:#ddd;font:15px/1.6 system-ui,sans-serif;max-width:520px;margin:60px auto;padding:0 20px}
h1{color:#fff;font-size:22px}a{color:#60a5fa}</style></head>
<body><h1>${esc(title)}</h1>${body}</body></html>`;
  }
}