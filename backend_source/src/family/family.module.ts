import { Module } from '@nestjs/common';
import { FamilyService } from './family.service';
import { MindmapModule } from '../mindmap/mindmap.module';


@Module({
  imports: [MindmapModule],
  providers: [FamilyService],
  exports: [FamilyService],
})
export class FamilyModule {}
