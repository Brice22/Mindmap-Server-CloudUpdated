import { Module } from '@nestjs/common';
import { PiholeController } from './pihole.controller';

@Module({
  controllers: [PiholeController],
})
export class PiholeModule {}