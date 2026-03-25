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

// --- AI: Generate quiz from node ---
  @Get('node/:id/quiz')
  async generateQuiz(@Param('id') id: string) {
    return await this.mindmapService.generateQuiz(Number(id));
  }

  // --- AI: Suggest similar nodes ---
  @Get('node/:id/similar')
  async findSimilar(@Param('id') id: string) {
    return await this.mindmapService.findSimilar(Number(id));
  }

  // === BOOKMARKS ===
  @Get('bookmarks')
  getBookmarks() { return this.mindmapService.getBookmarks(); }
  @Post('bookmarks')
  addBookmark(@Body() body: any) { return this.mindmapService.addBookmark(body.nodeId, body.nodeName, body.color, body.group); }
  @Delete('bookmarks/:id')
  removeBookmark(@Param('id') id: string) { return this.mindmapService.removeBookmark(Number(id)); }

  // === CALENDAR ===
  @Get('events')
  getEvents() { return this.mindmapService.getEvents(); }
  @Post('events')
  addEvent(@Body() body: any) { return this.mindmapService.addEvent(body.title, body.start, body.end, body.nodeId, body.color); }
  @Put('events/:id')
  updateEvent(@Param('id') id: string, @Body() body: any) { return this.mindmapService.updateEvent(Number(id), body); }
  @Delete('events/:id')
  deleteEvent(@Param('id') id: string) { return this.mindmapService.deleteEvent(Number(id)); }

  // === TRANSACTIONS ===
  @Get('transactions')
  getTransactions() { return this.mindmapService.getTransactions(); }
  @Post('transactions')
  addTransaction(@Body() body: any) { return this.mindmapService.addTransaction(body.name, body.amount, body.category, body.date, body.type); }
  @Delete('transactions/:id')
  deleteTransaction(@Param('id') id: string) { return this.mindmapService.deleteTransaction(Number(id)); }

  // === INVESTMENTS ===
  @Get('investments')
  getInvestments() { return this.mindmapService.getInvestments(); }
  @Post('investments')
  addInvestment(@Body() body: any) { return this.mindmapService.addInvestment(body); }
  @Put('investments/:id')
  updateInvestmentPrice(@Param('id') id: string, @Body() body: any) { return this.mindmapService.updateInvestment(Number(id), body.currentPrice); }
  @Delete('investments/:id')
  deleteInvestment(@Param('id') id: string) { return this.mindmapService.deleteInvestment(Number(id)); }

  // === HEALTH ===
  @Get('health')
  getHealthEntries() { return this.mindmapService.getHealthEntries(); }
  @Post('health')
  addHealthEntry(@Body() body: any) { return this.mindmapService.addHealthEntry(body.date, body.type, body.value, body.value2, body.notes); }
  @Delete('health/:id')
  deleteHealthEntry(@Param('id') id: string) { return this.mindmapService.deleteHealthEntry(Number(id)); }

  // === FLASHCARDS ===
  @Get('flashcards')
  getFlashcards() { return this.mindmapService.getFlashcards(); }
  @Post('flashcards')
  addFlashcard(@Body() body: any) { return this.mindmapService.addFlashcard(body); }
  @Put('flashcards/:id')
  updateFlashcard(@Param('id') id: string, @Body() body: any) { return this.mindmapService.updateFlashcard(Number(id), body); }
  @Delete('flashcards/:id')
  deleteFlashcard(@Param('id') id: string) { return this.mindmapService.deleteFlashcard(Number(id)); }

  // === COLLECTIONS ===
  @Get('collections')
  getCollections() { return this.mindmapService.getCollections(); }
  @Post('collections')
  addCollection(@Body() body: any) { return this.mindmapService.addCollection(body); }
  @Delete('collections/:id')
  deleteCollection(@Param('id') id: string) { return this.mindmapService.deleteCollection(Number(id)); }

  // === NEWS ===
  @Get('news/sources')
  getNewsSources() { return this.mindmapService.getNewsSources(); }
  @Post('news/sources')
  addNewsSource(@Body() body: any) { return this.mindmapService.addNewsSource(body); }
  @Delete('news/sources/:id')
  deleteNewsSource(@Param('id') id: string) { return this.mindmapService.deleteNewsSource(Number(id)); }
  @Get('news/articles')
  getSavedArticles(@Query('filter') filter: string) { return this.mindmapService.getSavedArticles(filter); }
  @Post('news/articles')
  saveArticle(@Body() body: any) { return this.mindmapService.saveArticle(body); }
  @Put('news/articles/:id')
  updateArticle(@Param('id') id: string, @Body() body: any) { return this.mindmapService.updateArticle(Number(id), body); }

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
