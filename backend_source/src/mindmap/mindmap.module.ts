import { Module } from '@nestjs/common';
import { MindmapController } from './mindmap.controller';
import { MindmapService } from './mindmap.service';
import { MindmapGateway } from './mindmap.gateway';
import { DatabaseModule } from '../database/database.module'; // <--- Added this
import { Neo4jModule } from '../neo4j/neo4j.module';

@Module({
  imports: [DatabaseModule, Neo4jModule], // <--- ENSURES DatabaseService is available
  controllers: [MindmapController],
  providers: [MindmapService, MindmapGateway],
  exports: [MindmapService],
})
export class MindmapModule {}
