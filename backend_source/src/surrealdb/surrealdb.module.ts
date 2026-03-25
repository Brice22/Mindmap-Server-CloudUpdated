import { Module, Global } from '@nestjs/common';
import { SurrealService } from './surreal.service';

@Global()
@Module({
  providers: [SurrealService],
  exports: [SurrealService],
})
export class SurrealModule {}