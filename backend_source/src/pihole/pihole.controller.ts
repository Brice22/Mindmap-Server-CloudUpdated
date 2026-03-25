import { Controller, Get, Post, Delete, Body, Query } from '@nestjs/common';

const PIHOLE_URL = 'http://pihole:80/admin/api.php';
const PIHOLE_TOKEN = process.env.PIHOLE_API_TOKEN || '';

@Controller('pihole')
export class PiholeController {
  @Get('status')
  async getStatus() {
    try {
      const res = await fetch(`${PIHOLE_URL}?summary&auth=${PIHOLE_TOKEN}`);
      return await res.json();
    } catch {
      return { status: 'unavailable' };
    }
  }

  @Post('enable')
  async enable() {
    try {
      await fetch(`${PIHOLE_URL}?enable&auth=${PIHOLE_TOKEN}`);
      return { enabled: true };
    } catch {
      return { error: 'Pi-hole unavailable' };
    }
  }

  @Post('disable')
  async disable(@Body() body: { seconds?: number }) {
    try {
      const duration = body.seconds || 0;
      await fetch(`${PIHOLE_URL}?disable=${duration}&auth=${PIHOLE_TOKEN}`);
      return { enabled: false, duration };
    } catch {
      return { error: 'Pi-hole unavailable' };
    }
  }

  @Post('blacklist')
  async addBlacklist(@Body() body: { domain: string }) {
    try {
      await fetch(`${PIHOLE_URL}?list=black&add=${body.domain}&auth=${PIHOLE_TOKEN}`);
      return { added: body.domain, type: 'blacklist' };
    } catch {
      return { error: 'Pi-hole unavailable' };
    }
  }

  @Post('whitelist')
  async addWhitelist(@Body() body: { domain: string }) {
    try {
      await fetch(`${PIHOLE_URL}?list=white&add=${body.domain}&auth=${PIHOLE_TOKEN}`);
      return { added: body.domain, type: 'whitelist' };
    } catch {
      return { error: 'Pi-hole unavailable' };
    }
  }

  @Delete('blacklist')
  async removeBlacklist(@Body() body: { domain: string }) {
    try {
      await fetch(`${PIHOLE_URL}?list=black&sub=${body.domain}&auth=${PIHOLE_TOKEN}`);
      return { removed: body.domain };
    } catch {
      return { error: 'Pi-hole unavailable' };
    }
  }
}