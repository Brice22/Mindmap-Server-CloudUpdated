// ============================================================
// 🔗 INTEGRATIONS ROUTES  (/api/integrations/...)  — owner only, except where marked
// ============================================================
// 📱 Calendar feed
//   GET  /calendar                       address + settings
//   PUT  /calendar                       { alertMinutes, allDayAlert, includeReviews, dailyReview, checkin, daysBack }
//   POST /calendar/reset                 new address (the old one stops working)
//   GET  /calendar/feed/:key.ics         PUBLIC (the key is the password) — what the iPhone subscribes to
// 🏦 Banks (Teller) + 📈 Webull
//   GET  /finance                        setup state, linked banks, accounts, Webull state
//   POST /finance/teller/enroll          { accessToken, enrollmentId, institution } from Teller Connect
//   DELETE /finance/teller/:linkId?removeTransactions=1
//   POST /finance/accounts/:id/flip      a card whose purchases came in as income → swap
//   POST /finance/webull/connect | /finance/webull/check
//   DELETE /finance/webull?removeInvestments=1
//   POST /finance/sync                   sync banks + Webull now
// ⌚ Garmin
//   GET  /garmin?days=30                 sync state + daily numbers
//   POST /garmin/sync                    ask the sync container to run now
//   POST /garmin/mfa                     { code } the code Garmin sent you
//   PUBLIC + x-hserver-sync-key (the garmin_sync container):
//   POST /garmin/ingest · POST /garmin/status · GET /garmin/poll
// ============================================================
import { Controller, Get, Post, Put, Delete, Param, Body, Query, Headers, Inject, Res, NotFoundException } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { CalendarFeedService } from './calendar-feed.service';
import { TellerService } from './teller.service';
import { WebullService } from './webull.service';
import { GarminService } from './garmin.service';
import { DatabaseService } from '../database/database.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(
    @Inject(CalendarFeedService) private readonly calendar: CalendarFeedService,
    @Inject(TellerService) private readonly teller: TellerService,
    @Inject(WebullService) private readonly webull: WebullService,
    @Inject(GarminService) private readonly garmin: GarminService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  // ---- 📱 calendar ----
  @Get('calendar')
  calendarInfo() { return this.calendar.info(); }

  @Put('calendar')
  calendarSave(@Body() body: any) { return this.calendar.saveSettings(body || {}); }

  @Post('calendar/reset')
  calendarReset() { return this.calendar.reset(); }

  @Public()
  @Get('calendar/feed/:file')
  async calendarFeed(@Param('file') file: string, @Res() res: Response) {
    const ics = await this.calendar.feed(file);
    if (!ics) throw new NotFoundException();
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="hserver.ics"');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(ics);
  }

  // ---- 🏦 📈 finance ----
  // (timestamps ::timestamptz so the browser gets the real moment, whatever the containers' time zones)
  @Get('finance')
  async finance() {
    const [links, accounts] = await Promise.all([
      this.db.query(`SELECT id, provider, label, institution, external_id, status, last_sync::timestamptz AS last_sync, last_error, created_at::timestamptz AS created_at FROM fin_links ORDER BY provider, id`),
      this.db.query(`SELECT id, link_id, provider, name, institution, type, subtype, last_four, currency, status,
                            balance_ledger, balance_available, balance_at::timestamptz AS balance_at, flip FROM fin_accounts ORDER BY provider, institution, name`),
    ]);
    return { teller: this.teller.config(), webull: await this.webull.state(), links: links.rows, accounts: accounts.rows };
  }

  @Post('finance/teller/enroll')
  enroll(@Body() body: any) { return this.teller.enroll(body || {}); }

  @Delete('finance/teller/:id')
  unlinkBank(@Param('id') id: string, @Query('removeTransactions') rm?: string) { return this.teller.unlink(Number(id), rm === '1'); }

  @Post('finance/accounts/:id/flip')
  flipAccount(@Param('id') id: string) { return this.teller.flip(Number(id)); }

  @Post('finance/webull/connect')
  webullConnect() { return this.webull.connect(); }

  @Post('finance/webull/check')
  webullCheck() { return this.webull.check(); }

  @Delete('finance/webull')
  webullUnlink(@Query('removeInvestments') rm?: string) { return this.webull.unlink(rm === '1'); }

  @Post('finance/sync')
  async financeSync() {
    const [banks, webull] = await Promise.all([this.teller.syncAll(), this.webull.sync()]);
    return { banks, webull };
  }

  // ---- ⌚ garmin ----
  @Get('garmin')
  garminOverview(@Query('days') days?: string) { return this.garmin.overview(days); }

  @Post('garmin/sync')
  garminSync() { return this.garmin.requestSync(); }

  @Post('garmin/mfa')
  garminMfa(@Body() body: any) { return this.garmin.mfa(body || {}); }

  @Public()
  @Post('garmin/ingest')
  garminIngest(@Headers('x-hserver-sync-key') key: string, @Body() body: any) { this.garmin.checkKey(key); return this.garmin.ingest(body || {}); }

  @Public()
  @Post('garmin/status')
  garminStatus(@Headers('x-hserver-sync-key') key: string, @Body() body: any) { this.garmin.checkKey(key); return this.garmin.status(body || {}); }

  @Public()
  @Get('garmin/poll')
  garminPoll(@Headers('x-hserver-sync-key') key: string) { this.garmin.checkKey(key); return this.garmin.poll(); }
}