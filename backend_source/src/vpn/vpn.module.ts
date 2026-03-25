import { Module } from '@nestjs/common';
import { VpnController } from './vpn.controller';

@Module({
  controllers: [VpnController],
})
export class VpnModule {}