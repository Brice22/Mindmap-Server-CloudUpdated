import { Module, Global } from '@nestjs/common';
import { DatabaseService } from './database.service';

@Global() // This makes the database service available everywhere without re-importing
@Module({
  providers: [DatabaseService],
  exports: [DatabaseService], // This "Exports" the tool so others can use it
})
export class DatabaseModule {}
