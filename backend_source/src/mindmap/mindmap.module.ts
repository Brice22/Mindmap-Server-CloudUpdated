import { Module } from '@nestjs/common';
import { MindmapController } from './mindmap.controller';
import { MindmapService } from './mindmap.service';
import { BacklinksService } from './backlinks.service';
import { GeocodeService } from './geocode.service';
import { TrashService } from './trash.service';
import { FlashcardSyncService } from './flashcard-sync.service';
import { FilesService } from './files.service';
import { WebClipService } from './web-clip.service';
import { FilesController } from './files.controller';
  import { SearchService } from './search.service';
  import { FileTextService } from './file-text.service';
  import { SearchController } from './search.controller';
import { MediaService } from './media.service';
import { MediaController } from './media.controller';
import { RegionsService } from './regions.service';
import { TorrentsService } from './torrents.service';
import { NetworkController } from './network.controller';
import { MindmapGateway } from './mindmap.gateway';
import { DatabaseModule } from '../database/database.module'; // <--- Added this
import { Neo4jModule } from '../neo4j/neo4j.module';

@Module({
  imports: [DatabaseModule, Neo4jModule], // <--- ENSURES DatabaseService is available
   controllers: [MindmapController, FilesController, SearchController, MediaController, NetworkController],
   providers: [MindmapService, MindmapGateway, BacklinksService, GeocodeService, TrashService, FilesService, WebClipService, FlashcardSyncService, SearchService, FileTextService, MediaService, RegionsService, TorrentsService],
   exports: [MindmapService],
})
export class MindmapModule {}
