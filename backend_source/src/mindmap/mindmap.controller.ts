import { Controller, Post, Get, Put, Param, Body, Logger, Inject, InternalServerErrorException, Delete, UseInterceptors, UploadedFile, Query } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MindmapService } from './mindmap.service';
import { diskStorage } from 'multer';
import { extname } from 'path';

@Controller('mindmap')
export class MindmapController {
  private readonly logger = new Logger(MindmapController.name);

  constructor(
    @Inject(MindmapService) private readonly mindmapService: MindmapService
  ) {}

  @Get()
  async getNodes() {
    return await this.mindmapService.findAll();
  }

  @Post('node')
  async addNode(@Body() body: any) {
    if (!this.mindmapService) throw new InternalServerErrorException('Injection Failed');
    const meta = body.metadata || {};
    return await this.mindmapService.createNode(
      body.name || 'Untitled', 
      body.description || '', 
      body.type || 'default', 
      meta
    );
  }

  @Put('node/:id')
  async editNode(@Param('id') id: string, @Body() body: any) {
    return await this.mindmapService.updateNode(
      Number(id), body.name, body.description, body.metadata || {}
    );
  }

  @Delete('node/:id')
  async removeNode(@Param('id') id: string) {
    return await this.mindmapService.deleteNode(Number(id));
  }

// --- SEARCH via MeiliSearch ---
@Get('search')
async searchNodes(@Query('q') query: string) {
  return await this.mindmapService.searchNodes(query);
}

// --- BOOKMARKS ---
// Bookmarks are stored in the node's metadata for simplicity
// No separate table needed — just flag nodes
@Put('node/:id/bookmark')
async toggleBookmark(@Param('id') id: string) {
  return await this.mindmapService.toggleBookmark(Number(id));
}

  // --- MEDIA UPLOAD ENDPOINT ---
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads',
      filename: (req, file, cb) => {
        const randomName = Array(4).fill(null).map(() => Math.round(Math.random() * 16).toString(16)).join('');
        cb(null, `${randomName}-${file.originalname}`);
      }
    })
  }))
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    this.logger.log('📸 File Uploaded: ' + file.filename);
    return { url: `/uploads/${file.filename}`, type: file.mimetype };
  }
}
