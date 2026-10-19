// ============================================================
// REMOTE ACCESS ROUTES  (/api/vpn/...)
// ============================================================
// GET /api/vpn/status                 DuckDNS check + devices (connected / last seen)
// GET /api/vpn/peers/:name/qr         setup QR (header x-setup-pin)
// GET /api/vpn/peers/:name/config     setup .conf file (header x-setup-pin)
// (The old exit-node routes are gone — 🌍 Regions replaced them.)
// ============================================================

import { Controller, Get, Param, Headers, Res, Inject } from '@nestjs/common';
import { VpnService } from './vpn.service';

@Controller('vpn')
export class VpnController {
  constructor(@Inject(VpnService) private readonly vpn: VpnService) {}

  @Get('status')
  status() { return this.vpn.status(); }

  @Get('peers/:name/qr')
  qr(@Param('name') name: string, @Headers('x-setup-pin') pin: string, @Res() res: any) {
    const png = this.vpn.peerSetup(name, pin, 'qr');
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store');
    res.send(png);
  }

  @Get('peers/:name/config')
  config(@Param('name') name: string, @Headers('x-setup-pin') pin: string, @Res() res: any) {
    const conf = this.vpn.peerSetup(name, pin, 'conf');
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="hserver-${name}.conf"`);
    res.setHeader('Cache-Control', 'no-store');
    res.send(conf);
  }
}