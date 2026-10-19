import { Module } from '@nestjs/common';
import { PiholeController } from './pihole.controller';
import { PiholeService } from './pihole.service';

@Module({
  controllers: [PiholeController],
  providers: [PiholeService],
})
export class PiholeModule {}