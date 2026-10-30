// ============================================================
// 📱 CALENDAR FEED - your HServer calendar on the iPhone (and Garmin watch)
// ============================================================
// One private address (with a random key in it) that the iPhone's Calendar
// subscribes to. It holds:
//   - every 📅 Calendar event and 📋 Scheduler block (with an alert N minutes before)
//   - 🔁 chapter reviews that are due (all-day, alert at a set time)
//   - optional daily reminders: 🧪 daily review and ✅ habits check-in
// The Garmin watch shows the phone's calendar and vibrates with its alerts
// (Garmin Connect app → your watch → Notifications / Calendar).
// One-way: change things in HServer; the phone picks them up when it refreshes.
// Reset the address if it ever leaks — the old one stops working at once.
// ============================================================

import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { localDay } from './vault';

export interface FeedSettings {
  alertMinutes: number;          // alert this many minutes before a timed event (0 = at the start, -1 = none)
  allDayAlert: string | null;    // HH:MM on the day of an all-day item (null = none)
  includeReviews: boolean;       // 🔁 chapter reviews due
  dailyReview: string | null;    // HH:MM daily "🧪 Daily review" reminder
  checkin: string | null;        // HH:MM daily "✅ habits" reminder
  daysBack: number;              // how far back events are sent
}
const DEFAULTS: FeedSettings = { alertMinutes: 10, allDayAlert: '09:00', includeReviews: true, dailyReview: null, checkin: null, daysBack: 60 };
const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

// ICS text: escape, and fold lines at 75 bytes
const esc = (s: any) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
function fold(line: string) {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}
const compact = (d: string) => d.replace(/[-:]/g, '');
const utcStamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

// A stored time → ICS start/end value ("all day", local "floating" time, or UTC)
function when(v: string): { allDay: boolean; value: string; date: Date | null } | null {
  const s = String(v || '').trim();
  let m = /^(\d{4}-\d{2}-\d{2})$/.exec(s);
  if (m) return { allDay: true, value: compact(m[1]), date: new Date(`${m[1]}T00:00:00`) };
  m = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (m) return { allDay: false, value: `${compact(m[1])}T${m[2]}${m[3]}${m[4] || '00'}`, date: new Date(`${m[1]}T${m[2]}:${m[3]}:${m[4] || '00'}`) };
  const d = new Date(s);
  if (!isNaN(d.getTime())) return { allDay: false, value: utcStamp(d), date: d };
  return null;
}
const nextDay = (yyyymmdd: string) => {
  const d = new Date(`${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10).replace(/-/g, '');
};

@Injectable()
export class CalendarFeedService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private async stored(): Promise<{ token: string; settings: FeedSettings }> {
    const row = (await this.db.query(`SELECT value FROM app_settings WHERE key = 'calendarFeed'`)).rows[0];
    const v = row?.value || {};
    if (v.token) return { token: v.token, settings: { ...DEFAULTS, ...(v.settings || {}) } };
    const token = crypto.randomBytes(24).toString('base64url');
    await this.save(token, DEFAULTS);
    return { token, settings: DEFAULTS };
  }

  private async save(token: string, settings: FeedSettings) {
    await this.db.query(
      `INSERT INTO app_settings (key, value, updated_at) VALUES ('calendarFeed', $1::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify({ token, settings })]);
  }

  async info() {
    const { token, settings } = await this.stored();
    return { path: `/api/integrations/calendar/feed/${token}.ics`, settings };
  }

  async saveSettings(b: any) {
    const { token, settings } = await this.stored();
    const time = (v: any, cur: string | null) => (v === undefined ? cur : v === null || v === '' ? null : HHMM.test(String(v)) ? String(v).padStart(5, '0') : (() => { throw new BadRequestException('Times look like 07:30'); })());
    const next: FeedSettings = {
      alertMinutes: b.alertMinutes === undefined ? settings.alertMinutes : Math.min(1440, Math.max(-1, Math.round(Number(b.alertMinutes) || 0))),
      allDayAlert: time(b.allDayAlert, settings.allDayAlert),
      includeReviews: b.includeReviews === undefined ? settings.includeReviews : !!b.includeReviews,
      dailyReview: time(b.dailyReview, settings.dailyReview),
      checkin: time(b.checkin, settings.checkin),
      daysBack: b.daysBack === undefined ? settings.daysBack : Math.min(3650, Math.max(1, Math.round(Number(b.daysBack) || 60))),
    };
    await this.save(token, next);
    return { path: `/api/integrations/calendar/feed/${token}.ics`, settings: next };
  }

  async reset() {
    const { settings } = await this.stored();
    const token = crypto.randomBytes(24).toString('base64url');
    await this.save(token, settings);
    return { path: `/api/integrations/calendar/feed/${token}.ics`, settings };
  }

  // The .ics file, or null when the key is wrong
  async feed(file: string): Promise<string | null> {
    const given = String(file || '').replace(/\.ics$/i, '');
    const { token, settings: s } = await this.stored();
    const a = Buffer.from(given), b = Buffer.from(token);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const since = new Date(); since.setDate(since.getDate() - s.daysBack);
    const [events, reviews] = await Promise.all([
      this.db.query('SELECT id, title, start_time, end_time, done FROM calendar_events ORDER BY start_time'),
      s.includeReviews
        ? this.db.query(`SELECT r.id, to_char(r.due, 'YYYY-MM-DD') AS due, c.name FROM chapter_reviews r
                         JOIN mindmap_nodes c ON c.id = r.chapter_id WHERE r.done_at IS NULL`).catch(() => ({ rows: [] as any[] }))
        : Promise.resolve({ rows: [] as any[] }),
    ]);
    const stamp = utcStamp();
    const app = process.env.APP_URL || '';
    const lines: string[] = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HServer//Mindmap//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'X-WR-CALNAME:HServer', `X-WR-TIMEZONE:${process.env.TZ || 'America/Chicago'}`,
      'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M',
    ];
    const allDayTrigger = () => {
      if (!s.allDayAlert) return null;
      const [h, m] = s.allDayAlert.split(':').map(Number);
      return `PT${h}H${m}M`;
    };
    const alarm = (trigger: string | null, text: string) =>
      trigger ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(text)}`, `TRIGGER:${trigger}`, 'END:VALARM'] : [];

    for (const e of events.rows) {
      const st = when(e.start_time);
      if (!st || (st.date && st.date < since)) continue;
      const en = e.end_time ? when(e.end_time) : null;
      const title = `${e.done ? '✓ ' : ''}${e.title}`;
      lines.push('BEGIN:VEVENT', `UID:hserver-event-${e.id}@hserver`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(title)}`);
      if (st.allDay) {
        lines.push(`DTSTART;VALUE=DATE:${st.value}`, `DTEND;VALUE=DATE:${en?.allDay && en.value > st.value ? nextDay(en.value) : nextDay(st.value)}`);
        lines.push(...alarm(e.done ? null : allDayTrigger(), e.title));
      } else {
        lines.push(`DTSTART:${st.value}`);
        if (en && !en.allDay && en.value > st.value) lines.push(`DTEND:${en.value}`); else lines.push('DURATION:PT30M');
        lines.push(...alarm(e.done || s.alertMinutes < 0 ? null : `-PT${s.alertMinutes}M`, e.title));
      }
      if (app) lines.push(`URL:${app}`);
      lines.push('END:VEVENT');
    }

    for (const r of reviews.rows) {
      const d = compact(r.due);
      lines.push('BEGIN:VEVENT', `UID:hserver-review-${r.id}@hserver`, `DTSTAMP:${stamp}`,
        `SUMMARY:${esc(`🔁 Review: ${r.name}`)}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${nextDay(d)}`,
        `DESCRIPTION:${esc('Quiz Center → ✅ Today → Chapter reviews')}`,
        ...alarm(allDayTrigger(), `Review ${r.name}`), 'END:VEVENT');
    }

    // Daily reminders repeat every day from today
    const today = compact(localDay());
    const daily = (key: string, at: string | null, title: string, note: string) => {
      if (!at) return;
      const [h, m] = at.split(':');
      lines.push('BEGIN:VEVENT', `UID:hserver-daily-${key}@hserver`, `DTSTAMP:${stamp}`, `SUMMARY:${esc(title)}`,
        `DTSTART:${today}T${h}${m}00`, 'DURATION:PT15M', 'RRULE:FREQ=DAILY', `DESCRIPTION:${esc(note)}`,
        ...alarm('PT0M', title), 'END:VEVENT');
    };
    daily('review', s.dailyReview, '🧪 Daily review', 'Quiz Center → ✅ Today → Start');
    daily('checkin', s.checkin, '✅ Daily habits', 'Tick today’s habits in Quiz Center → ✅ Today');

    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }
}