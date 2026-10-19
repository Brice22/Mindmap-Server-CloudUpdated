// ============================================================
// BACKUPS ROUTES  (/api/backups/...)
// ============================================================
// The "backup" container (configs/backup) does the work and writes
// its status to /srv/hserverdir-data/backups/status, which the
// backend sees as BACKUP_STATUS_DIR (/app/backup-status).
// GET  /api/backups       last run, each destination, list of copies
// POST /api/backups/run   "Back up now" (the container picks it up within 10 s)
// GET  /api/backups/log   last lines of backup.log
// ============================================================

import { Controller, Get, Post, BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

const DIR = process.env.BACKUP_STATUS_DIR || '/app/backup-status';

@Controller('backups')
export class BackupsController {
  @Get()
  status() {
    const read = (f: string) => { try { return fs.readFileSync(path.join(DIR, f), 'utf8'); } catch { return null; } };
    const heartbeat = Number(read('heartbeat')) || 0;
    const alive = heartbeat > 0 && Date.now() / 1000 - heartbeat < 60;
    let status: any = null;
    try { status = JSON.parse(read('status.json') || 'null'); } catch {}
    return {
      installed: !!status || heartbeat > 0,
      alive,
      requested: fs.existsSync(path.join(DIR, 'request')),
      ...(status || {}),
      repos: Object.values(status?.repos || {}),
    };
  }

  @Post('run')
  run() {
    if (!fs.existsSync(DIR)) throw new BadRequestException('The backup container is not set up yet (configs/backup/README.md)');
    fs.writeFileSync(path.join(DIR, 'request'), new Date().toISOString());
    return { queued: true };
  }

  @Get('log')
  log() {
    try {
      const lines = fs.readFileSync(path.join(DIR, 'backup.log'), 'utf8').trim().split('\n');
      return { lines: lines.slice(-150) };
    } catch {
      return { lines: [] };
    }
  }
}