// ============================================================
// BACKUPS SERVICE - runs scripts/backup.sh (restic)
// ============================================================
// Every night at BACKUP_TIME (default 03:30), and when you press
// "Back up now", the backend runs scripts/backup.sh:
//   Postgres dump + Vaultwarden copy + /srv/hserverdir-data + .env
//   → encrypted restic backup in the backup folder on the other disk.
// The script writes its progress to BACKUP_STATUS_DIR/status.json,
// which the 💾 Backups tab shows. Setup: scripts/BACKUPS.md
// Folders (docker-compose.yml → backend_nest → volumes):
//   /data          = /srv/hserverdir-data (read-only, what gets backed up)
//   /backup-work   = /srv/hserverdir-data/backups (status, dumps, cache)
//   /drive         = BACKUP_DRIVE (the backup folder on the other disk)
// ============================================================

import { Injectable, Logger, OnModuleInit, OnModuleDestroy, BadRequestException } from '@nestjs/common';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const SCRIPT = process.env.BACKUP_SCRIPT || path.join(process.cwd(), 'scripts', 'backup.sh');
export const STATUS_DIR = process.env.BACKUP_STATUS_DIR || '/backup-work/status';
const WORK_DIR = path.dirname(STATUS_DIR);
const BACKUP_TIME = (process.env.BACKUP_TIME || '03:30').trim();

@Injectable()
export class BackupsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackupsService.name);
  private child: ChildProcess | null = null;
  private timer: NodeJS.Timeout | null = null;
  private nextRun = 0;

  get configured() { return !!process.env.RESTIC_PASSWORD; }
  get running() { return !!this.child; }
  get next() { return this.nextRun ? new Date(this.nextRun).toISOString() : null; }

  onModuleInit() {
    this.nextRun = this.computeNext();
    this.timer = setInterval(() => {
      if (Date.now() < this.nextRun) return;
      this.nextRun = this.computeNext(Date.now() + 60_000);
      if (this.configured) this.run('scheduled').catch(e => this.logger.warn(e?.message || e));
    }, 30_000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  // Next HH:MM after `from` (local time of the container, TZ in docker-compose.yml)
  private computeNext(from = Date.now()) {
    const [h, m] = BACKUP_TIME.split(':').map(Number);
    const d = new Date(from);
    d.setHours(Number.isFinite(h) ? h : 3, Number.isFinite(m) ? m : 30, 0, 0);
    if (d.getTime() <= from) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  async run(reason: 'manual' | 'scheduled' = 'manual') {
    if (this.child) return { running: true };
    if (!this.configured) throw new BadRequestException('Backups aren\'t set up: add RESTIC_PASSWORD and BACKUP_DRIVE to .env (scripts/BACKUPS.md)');
    if (!fs.existsSync(SCRIPT)) throw new BadRequestException(`Backup script not found: ${SCRIPT}`);
    fs.mkdirSync(STATUS_DIR, { recursive: true });

    // Feed the script through stdin with Windows line endings removed (works even if it was saved with CRLF)
    const script = fs.readFileSync(SCRIPT, 'utf8').replace(/\r/g, '');
    const env = {
      ...process.env,
      PGHOST: process.env.BACKEND_DB_HOST || 'postgres',
      PGUSER: process.env.DB_USER || 'postgres',
      PGPASSWORD: process.env.DB_PASSWORD || '',
      STATUS_DIR,
      DUMP_DIR: path.join(WORK_DIR, 'dumps'),
      RESTIC_CACHE_DIR: path.join(WORK_DIR, 'cache'),
      DATA_DIR: process.env.BACKUP_DATA_DIR || '/data',
      EXCLUDES: path.join(path.dirname(SCRIPT), 'backup-excludes.txt'),
      REPO_DRIVE: process.env.RESTIC_REPOSITORY || '/drive/hserver-restic',
      BACKUP_TIME,
    };
    const child = spawn('bash', ['-s', '--', reason], { env, stdio: ['pipe', 'ignore', 'ignore'] });
    this.child = child;
    child.stdin!.end(script);
    this.logger.log(`Backup started (${reason})`);
    child.on('exit', code => {
      this.child = null;
      this.logger.log(`Backup finished (exit ${code})`);
    });
    child.on('error', e => {
      this.child = null;
      this.logger.warn(`Backup could not start: ${e.message}`);
    });
    return { running: true };
  }
}