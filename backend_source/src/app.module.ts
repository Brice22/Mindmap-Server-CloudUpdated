import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { DatabaseModule } from './database/database.module';
import { MindmapModule } from './mindmap/mindmap.module';
import { FamilyModule } from './family/family.module';
import { SurrealModule } from './surrealdb/surrealdb.module';
import { MindsDBModule } from './mindsdb/mindsdb.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    // FIX: This creates the "Public Folder" for your media
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'uploads'), 
      serveRoot: '/uploads', 
    }),
    DatabaseModule,
    MindmapModule,
    FamilyModule,
    SurrealModule,
    MindsDBModule,
 ])
export class AppModule {}
