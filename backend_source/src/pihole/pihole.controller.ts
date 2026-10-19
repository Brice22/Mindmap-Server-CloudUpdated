// ============================================================
// PI-HOLE ROUTES  (/api/pihole/...)
// ============================================================
// GET    status                      on/off, today's numbers, devices using it
// POST   blocking   {enabled, seconds?}   turn off (for N seconds) / on
// GET    domains                     your always-block / always-allow domains
// POST   domains    {domain, type: 'allow'|'deny'}
// DELETE domains/:type/:kind/:domain
// GET    lists                       blocklists + one-click presets
// POST   lists      {address}        add a blocklist
// PUT    lists      {address, enabled}
// DELETE lists?address=…
// POST   lists/update                download the lists again (gravity)
// GET    blocked?client=…            recently blocked domains
// ============================================================

import { Controller, Get, Post, Put, Delete, Body, Param, Query, Inject } from '@nestjs/common';
import { PiholeService } from './pihole.service';

@Controller('pihole')
export class PiholeController {
  constructor(@Inject(PiholeService) private readonly pihole: PiholeService) {}

  @Get('status')
  status() { return this.pihole.status(); }

  @Post('blocking')
  setBlocking(@Body() body: { enabled: boolean; seconds?: number | null }) {
    return this.pihole.setBlocking(body.enabled, body.seconds);
  }

  @Get('domains')
  domains() { return this.pihole.domains(); }

  @Post('domains')
  addDomain(@Body() body: { domain: string; type: 'allow' | 'deny'; kind?: 'exact' | 'regex' }) {
    return this.pihole.addDomain(body.domain, body.type, body.kind || 'exact');
  }

  @Delete('domains/:type/:kind/:domain')
  removeDomain(@Param('type') type: string, @Param('kind') kind: string, @Param('domain') domain: string) {
    return this.pihole.removeDomain(type, kind, domain);
  }

  @Get('lists')
  lists() { return this.pihole.lists(); }

  @Post('lists/update')
  updateLists() { return this.pihole.updateLists(); }

  @Post('lists')
  addList(@Body() body: { address: string; comment?: string }) {
    return this.pihole.addList(body.address, body.comment);
  }

  @Put('lists')
  setListEnabled(@Body() body: { address: string; enabled: boolean }) {
    return this.pihole.setListEnabled(body.address, body.enabled);
  }

  @Delete('lists')
  removeList(@Query('address') address: string) {
    return this.pihole.removeList(address);
  }

  @Get('blocked')
  blocked(@Query('client') client?: string) {
    return this.pihole.recentBlocked(client);
  }
}