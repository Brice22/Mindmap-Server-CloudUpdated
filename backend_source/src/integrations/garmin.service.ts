// ============================================================
// ⌚ GARMIN - daily health numbers from Garmin Connect in 🏥 Health
// ============================================================
// The garmin_sync container (backend_source/garmin/garmin_sync.py) logs in to
// Garmin Connect and posts each day here; this keeps one row per day in
// garmin_daily and the sync's state (ok / syncing / needs a code / error)
// in app_settings 'garmin'.
// Its calls use the header x-hserver-sync-key = GARMIN_SYNC_KEY (.env).
// ============================================================

import { Injectable, Inject, BadRequestException, UnauthorizedException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';

const FIELDS: [string, string][] = [
  ['steps', 'steps'], ['restingHr', 'resting_hr'], ['stressAvg', 'stress_avg'], ['bodyBatteryHigh', 'body_battery_high'],
  ['bodyBatteryLow', 'body_battery_low'], ['caloriesTotal', 'calories_total'], ['caloriesActive', 'calories_active'],
  ['intensityMinutes', 'intensity_minutes'], ['sleepSeconds', 'sleep_seconds'], ['sleepScore', 'sleep_score'],
  ['hydrationMl', 'hydration_ml'], ['foodCalories', 'food_calories'], ['proteinG', 'protein_g'], ['carbsG', 'carbs_g'], ['fatG', 'fat_g'],
];

@Injectable()
export class GarminService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  // The sync container proves itself with the shared key
  checkKey(given: string | undefined) {
    const want = process.env.GARMIN_SYNC_KEY || '';
    const a = Buffer.from(String(given || '')), b = Buffer.from(want);
    if (!want || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new UnauthorizedException('Wrong sync key');
  }

  private async getState(): Promise<any> {
    return (await this.db.query(`SELECT value FROM app_settings WHERE key = 'garmin'`)).rows[0]?.value || {};
  }
  private async setState(patch: any) {
    const v = { ...(await this.getState()), ...patch, updatedAt: new Date().toISOString() };
    await this.db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('garmin', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [JSON.stringify(v)]);
    return v;
  }

  // --- from the sync container ---------------------------------
  async ingest(b: any) {
    const days = Array.isArray(b.days) ? b.days : [];
    let saved = 0;
    for (const d of days) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.day || ''))) continue;
      const vals = FIELDS.map(([k]) => (d[k] == null || !Number.isFinite(Number(d[k])) ? null : Number(d[k])));
      await this.db.query(
        `INSERT INTO garmin_daily (day, ${FIELDS.map(f => f[1]).join(', ')}, raw, updated_at)
         VALUES ($1, ${FIELDS.map((_, i) => `$${i + 2}`).join(', ')}, $${FIELDS.length + 2}::jsonb, NOW())
         ON CONFLICT (day) DO UPDATE SET ${FIELDS.map(f => `${f[1]} = EXCLUDED.${f[1]}`).join(', ')}, raw = EXCLUDED.raw, updated_at = NOW()`,
        [d.day, ...vals, JSON.stringify(d.raw ?? null)]);
      saved++;
    }
    return { saved };
  }

  async status(b: any) {
    const state = ['ok', 'syncing', 'needs_mfa', 'error', 'no_credentials'].includes(b.state) ? b.state : 'error';
    return this.setState({ state, message: String(b.message || '').slice(0, 300), ...(b.lastSync ? { lastSync: String(b.lastSync) } : {}) });
  }

  // What the container should do next: sync now? a code you typed?
  async poll() {
    const s = await this.getState();
    const out = { syncRequested: !!s.syncRequested, mfaCode: s.mfaCode || null };
    if (s.syncRequested || s.mfaCode) await this.setState({ syncRequested: false, mfaCode: null, polledAt: new Date().toISOString() });
    else await this.setState({ polledAt: new Date().toISOString() });
    return out;
  }

  // --- from the Health page ------------------------------------
  async overview(daysRaw?: any) {
    const days = Math.min(365, Math.max(1, Math.round(Number(daysRaw) || 30)));
    const s = await this.getState();
    const rows = (await this.db.query(
      `SELECT to_char(day, 'YYYY-MM-DD') AS day, ${FIELDS.map(f => f[1]).join(', ')}, updated_at::timestamptz AS updated_at
       FROM garmin_daily WHERE day > CURRENT_DATE - $1::int ORDER BY day DESC`, [days])).rows;
    // The container checks in every minute; silent for 5+ minutes = not running
    const seen = s.polledAt ? Date.now() - Date.parse(s.polledAt) : Infinity;
    return {
      state: s.state || 'not_running', message: s.message || '', lastSync: s.lastSync || null,
      running: seen < 5 * 60_000, keySet: !!process.env.GARMIN_SYNC_KEY, syncRequested: !!s.syncRequested, days: rows,
    };
  }

  async requestSync() { await this.setState({ syncRequested: true }); return { success: true }; }

  async mfa(b: any) {
    const code = String(b.code || '').replace(/\s+/g, '');
    if (!/^\d{4,8}$/.test(code)) throw new BadRequestException('Type the code from Garmin (numbers only)');
    await this.setState({ mfaCode: code });
    return { success: true };
  }
}