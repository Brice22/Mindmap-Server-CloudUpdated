// ============================================================
// 🔗 INTEGRATIONS - phone calendar feed, banks (Teller), Webull, Garmin
// ============================================================
// Banks and Webull sync every day at FINANCE_SYNC_TIME (default 05:30, .env)
// and whenever you press "Sync now" in Finance.
// ============================================================
import { Module, Inject, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { CalendarFeedService } from './calendar-feed.service';
import { TellerService } from './teller.service';
import { WebullService } from './webull.service';
import { GarminService } from './garmin.service';
import { msUntil } from './vault';

@Module({
  controllers: [IntegrationsController],
  providers: [CalendarFeedService, TellerService, WebullService, GarminService],
})
export class IntegrationsModule implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('FinanceSync');
  private timer: any = null;

  constructor(
    @Inject(TellerService) private readonly teller: TellerService,
    @Inject(WebullService) private readonly webull: WebullService,
  ) {}

  onModuleInit() { this.schedule(); }
  onModuleDestroy() { clearTimeout(this.timer); }

  private schedule() {
    const wait = msUntil(process.env.FINANCE_SYNC_TIME || '05:30');
    this.timer = setTimeout(async () => {
      try {
        const [banks, webull] = await Promise.all([this.teller.syncAll(), this.webull.sync()]);
        this.logger.log(`Daily sync: banks ${JSON.stringify(banks)}, Webull ${JSON.stringify(webull)}`);
      } catch (e: any) { this.logger.warn(`Daily sync failed: ${e.message}`); }
      this.schedule();
    }, wait);
  }
}