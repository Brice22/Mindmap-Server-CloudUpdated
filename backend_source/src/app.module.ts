import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join, sep } from 'path';
import { UPLOAD_ROOT } from './mindmap/uploads';
import { DatabaseModule } from './database/database.module';
import { MindmapModule } from './mindmap/mindmap.module';
import { FamilyModule } from './family/family.module';
import { SurrealModule } from './surrealdb/surrealdb.module';
import { MindsDBModule } from './mindsdb/mindsdb.module';
import { KeyDBModule } from './keydb/keydb.module';
import { MetricsModule } from './metrics/metrics.module';
import { VpnModule } from './vpn/vpn.module';
import { PiholeModule } from './pihole/pihole.module';
import { BackupsModule } from './backups/backups.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    // FIX: This creates the "Public Folder" for your media
    ServeStaticModule.forRoot({
           rootPath: UPLOAD_ROOT,          // same folder the app saves into (cloud_data in Docker)
      serveRoot: '/uploads',
      serveStaticOptions: {
        // Saved web pages are other people's HTML: never let their scripts run on this server
        setHeaders: (res: any, filePath: string) => {
          if (filePath.includes(`${sep}web${sep}`)) res.setHeader('Content-Security-Policy', "script-src 'none'; object-src 'none'");
        },
      }, 
    }),
    DatabaseModule,
    MindmapModule,
    FamilyModule,
    SurrealModule,
    MindsDBModule,
    MindsDBModule,
    KeyDBModule,
    MetricsModule,
    VpnModule,
    PiholeModule,
    BackupsModule,
 ]
})
export class AppModule {}
