import { Module, Global } from '@nestjs/common';
import { MindsDBService } from './mindsdb.service';

@Global()
@Module({
  providers: [MindsDBService],
  exports: [MindsDBService],
})
export class MindsDBModule {}