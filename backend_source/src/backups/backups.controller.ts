// ============================================================
// BACKUPS ROUTES  (/api/backups/...)
// ============================================================
// The backend runs the backups itself (BackupsService → scripts/backup.sh)
// and the script writes its status to BACKUP_STATUS_DIR/status.json.
// GET  /api/backups       last run, the backup folder, list of copies
// POST /api/backups/run   "Back up now"
// GET  /api/backups/log   last lines of backup.log
// ============================================================

import { Controller, Get, Post, Inject } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import { BackupsService, STATUS_DIR } from './backups.service';

@Controller('backups')
export class BackupsController {
  constructor(@Inject(BackupsService) private readonly backups: BackupsService) {}

  @Get()
  status() {
    let status: any = null;
    try { status = JSON.parse(fs.readFileSync(path.join(STATUS_DIR, 'status.json'), 'utf8')); } catch {}
    const running = this.backups.running;
    return {
      ...(status || {}),
      installed: this.backups.configured,
      alive: true,
      requested: false,
      running,
      phase: running ? status?.phase || 'Starting' : null,
      nextRun: this.backups.next,
      repos: Object.values(status?.repos || {}),
    };
  }

  @Post('run')
  run() {
    return this.backups.run('manual');
  }

  @Get('log')
  log() {
    try {
      const lines = fs.readFileSync(path.join(STATUS_DIR, 'backup.log'), 'utf8').trim().split('\n');
      return { lines: lines.slice(-150) };
    } catch {
      return { lines: [] };
    }
  }
}