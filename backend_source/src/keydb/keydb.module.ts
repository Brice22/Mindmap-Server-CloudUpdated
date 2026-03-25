import { Module, Global } from '@nestjs/common';
import { KeyDBService } from './keydb.service';

@Global()
@Module({
  providers: [KeyDBService],
  exports: [KeyDBService],
})
export class KeyDBModule {}