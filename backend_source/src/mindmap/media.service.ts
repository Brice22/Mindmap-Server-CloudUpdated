// ============================================================
// MEDIA SERVICE - videos and audio that play in the browser (FFmpeg)
// ============================================================
// Every video/audio file in the library is checked once (ffprobe):
//   - already plays in browsers (H.264/VP9/AV1 + AAC/MP3/Opus in
//     MP4/WebM, or MP3/M4A/OGG/WAV/FLAC audio) → just a thumbnail
//   - anything else (MKV, AVI, WMV, FLV, HEVC/x265, AC3/DTS audio, WMA…)
//     → a browser copy is made: MP4 (H.264 + AAC, "faststart" so it
//     starts playing at once and you can jump around). If the video is
//     already H.264 only the container/audio is redone, which is fast.
// On request: a small 720p copy (~2 Mbit/s) for watching away from
// home, where your home upload speed is the limit.
// Copies live in uploads/derived/<file id>/ — the original is kept.
// One job at a time (FFmpeg uses all CPU cores). Progress is saved in
// files.media_progress so 📁 Files can show it.
// files.media_status: NULL = not checked · ok (plays as is) · queued ·
//   converting · done (copy made) · shrinking · failed · needs-ffmpeg
// ============================================================

import { Injectable, Inject, Logger } from '@nestjs/common';
import * as fs from 'fs';
import { DatabaseService } from '../database/database.service';
import { absPath, removePath, mimeFromName } from './uploads';
import { hasTool, probe, run, MediaInfo } from './media-tools';

const MEDIA_NAME = /\.(mp4|m4v|mkv|avi|wmv|mov|flv|webm|mpe?g|ts|m2ts|mts|3gp|ogv|vob|mp3|m4a|aac|wav|flac|ogg|oga|opus|wma|amr|ac3|aiff?|ape)$/i;
const PLAYABLE_VIDEO = new Set(['h264', 'vp8', 'vp9', 'av1']);
const PLAYABLE_AUDIO = new Set(['aac', 'mp3', 'opus', 'vorbis', 'flac']);
const BROWSER_CONTAINERS = ['mp4', 'mov', 'webm', 'mp3', 'ogg', 'wav', 'flac', 'aac'];

const derivedDir = (fileId: number) => `derived/${fileId}`;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private running: Promise<void> | null = null;
  private again = false;
  private small = new Set<number>();          // 720p copies asked for

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {
    setTimeout(() => this.prepare().finally(() => this.kick()), 25_000);
    setInterval(() => this.kick(), 60_000);
  }

  // Jobs cut off by a restart start again; files that waited for FFmpeg get checked once it's installed
  private async prepare() {
    await this.db.query(`UPDATE files SET media_status = NULL, media_progress = NULL WHERE media_status IN ('queued', 'converting')`).catch(() => {});
    await this.db.query(`UPDATE files SET media_status = 'done', media_progress = NULL WHERE media_status = 'shrinking'`).catch(() => {});
    if (await hasTool('ffmpeg')) {
      await this.db.query(`UPDATE files SET media_status = NULL WHERE media_status = 'needs-ffmpeg'`).catch(() => {});
    } else {
      this.logger.warn('ffmpeg not installed — videos are not converted');
    }
  }

  status() {
    return Promise.all([hasTool('ffmpeg'), hasTool('tesseract'), hasTool('pdftoppm')])
      .then(([ffmpeg, tesseract, pdftoppm]) => ({ ffmpeg, ocr: tesseract, ocrPdf: tesseract && pdftoppm }));
  }

  kick() {
    if (this.running) { this.again = true; return; }
    this.running = (async () => {
      do {
        this.again = false;
        for (;;) {
          const next = await this.nextJob();
          if (!next) break;
          await next();
        }
      } while (this.again);
    })().catch(e => this.logger.warn('Media queue stopped: ' + (e?.message || e))).finally(() => { this.running = null; });
  }

  private async nextJob(): Promise<(() => Promise<void>) | null> {
    const res = await this.db.query(
      `SELECT id FROM files
       WHERE media_status IS NULL AND path NOT LIKE 'derived/%' AND path NOT LIKE 'web/%'
         AND (mime LIKE 'video/%' OR mime LIKE 'audio/%' OR name ~* $1)
       ORDER BY id LIMIT 1`,
      [MEDIA_NAME.source],
    ).catch(() => ({ rows: [] as any[] }));
    if (res.rows[0]) return () => this.processFile(res.rows[0].id);
    const [smallId] = this.small;
    if (smallId !== undefined) { this.small.delete(smallId); return () => this.makeSmall(smallId); }
    return null;
  }

  // "📶 Small copy" button
  async requestSmall(fileId: number) {
    this.small.add(fileId);
    this.kick();
    return { queued: true };
  }

  // "Try again" after a failure
  async retry(fileId: number) {
    await this.db.query(`UPDATE files SET media_status = NULL, media_progress = NULL WHERE id = $1`, [fileId]);
    this.kick();
    return { queued: true };
  }

  // A file left the library: its copies go too
  async forget(fileId: number) {
    this.small.delete(fileId);
    await removePath(derivedDir(fileId));
  }

  // ------------------------------------------------------------
  private async processFile(fileId: number) {
    const file = (await this.db.query('SELECT id, path, name, mime FROM files WHERE id = $1', [fileId])).rows[0];
    if (!file) return;
    if (!(await hasTool('ffmpeg')) || !(await hasTool('ffprobe'))) {
      await this.set(fileId, { media_status: 'needs-ffmpeg' });
      return;
    }
    const abs = absPath(file.path);
    let info: MediaInfo;
    try {
      info = await probe(abs);
    } catch (e: any) {
      await this.set(fileId, { media_status: 'failed', media_info: { error: String(e?.message || e) } });
      return;
    }
    const isVideo = !!info.vcodec;
    if (!isVideo && !info.acodec) {   // not media after all (e.g. a .ts text file)
      await this.set(fileId, { media_status: 'ok', media_info: info });
      return;
    }
    // Uploaded with an unknown type ("application/octet-stream") → label it so the app shows a player
    if (!/^(video|audio)\//.test(file.mime || '')) {
      const guess = mimeFromName(file.name);
      await this.set(fileId, { mime: /^(video|audio)\//.test(guess) ? guess : isVideo ? 'video/mp4' : 'audio/mpeg' });
    }
    const dir = derivedDir(fileId);
    await fs.promises.mkdir(absPath(dir), { recursive: true });

    // Thumbnail (videos)
    let thumb: string | null = null;
    if (isVideo) {
      const at = Math.min(10, (info.duration || 0) * 0.1);
      const r = await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(at), '-i', abs, '-frames:v', '1', '-vf', 'scale=480:-2', '-q:v', '4', absPath(`${dir}/thumb.jpg`)], { timeoutMs: 120_000 });
      if (r.code === 0) thumb = `${dir}/thumb.jpg`;
    }

    const containerOk = BROWSER_CONTAINERS.some(c => info.format.split(',').includes(c));
    const videoOk = !isVideo || (PLAYABLE_VIDEO.has(info.vcodec!) && (!info.pixfmt || /^(yuv420p|yuvj420p)$/.test(info.pixfmt) || info.vcodec !== 'h264'));
    const audioOk = !info.acodec || PLAYABLE_AUDIO.has(info.acodec);
    if (containerOk && videoOk && audioOk) {
      await this.set(fileId, { media_status: 'ok', media_info: info, thumb_path: thumb });
      return;
    }

    // Browser copy
    await this.set(fileId, { media_status: 'converting', media_info: info, thumb_path: thumb, media_progress: 0 });
    const out = isVideo ? `${dir}/web.mp4` : `${dir}/web.m4a`;
    const copyVideo = isVideo && info.vcodec === 'h264' && /^(yuv420p|yuvj420p)$/.test(info.pixfmt || '');
    const args = isVideo
      ? ['-y', '-v', 'error', '-i', abs, '-map', '0:v:0', '-map', '0:a:0?',
         ...(copyVideo ? ['-c:v', 'copy'] : ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-vf', "scale='min(1920,iw)':-2"]),
         '-c:a', 'aac', '-b:a', '160k', '-ac', '2', '-movflags', '+faststart']
      : ['-y', '-v', 'error', '-i', abs, '-vn', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'];
    const ok = await this.ffmpeg(fileId, [...args, absPath(out)], info.duration);
    if (ok) {
      this.logger.log(`Converted "${file.name}" for the browser${copyVideo ? ' (video copied, audio redone)' : ''}`);
      await this.set(fileId, { media_status: 'done', play_path: out, media_progress: null });
    } else {
      await removePath(out);
      await this.set(fileId, { media_status: 'failed', media_progress: null });
    }
  }

  // 720p copy for watching away from home
  private async makeSmall(fileId: number) {
    const file = (await this.db.query('SELECT id, path, name, media_status, media_info, play_path FROM files WHERE id = $1', [fileId])).rows[0];
    if (!file || !(await hasTool('ffmpeg'))) return;
    const info = file.media_info || {};
    if (!info.vcodec) return;
    const before = file.media_status;
    const dir = derivedDir(fileId);
    await fs.promises.mkdir(absPath(dir), { recursive: true });
    const out = `${dir}/720p.mp4`;
    await this.set(fileId, { media_status: 'shrinking', media_progress: 0 });
    const ok = await this.ffmpeg(fileId, [
      '-y', '-v', 'error', '-i', absPath(file.path), '-map', '0:v:0', '-map', '0:a:0?',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-maxrate', '2M', '-bufsize', '4M', '-pix_fmt', 'yuv420p',
      '-vf', "scale=-2:'min(720,ih)'", '-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-movflags', '+faststart', absPath(out),
    ], info.duration);
    await this.set(fileId, { media_status: before === 'shrinking' ? 'ok' : before, media_progress: null, ...(ok ? { small_path: out } : {}) });
    if (ok) this.logger.log(`Made 720p copy of "${file.name}"`);
    else await removePath(out);
  }

  // Run ffmpeg with progress written to the database every few seconds
  private async ffmpeg(fileId: number, args: string[], duration: number | null): Promise<boolean> {
    let last = 0;
    const r = await run('ffmpeg', ['-progress', 'pipe:1', '-nostats', ...args], {
      timeoutMs: 12 * 60 * 60 * 1000,
      onStdout: (chunk) => {
        const m = /out_time_(?:ms|us)=(\d+)/.exec(chunk);
        if (!m || !duration) return;
        const pct = Math.min(99, (Number(m[1]) / 1_000_000 / duration) * 100);
        if (Date.now() - last > 3000) {
          last = Date.now();
          this.db.query('UPDATE files SET media_progress = $2 WHERE id = $1', [fileId, Math.round(pct)]).catch(() => {});
        }
      },
    });
    if (r.code !== 0) this.logger.warn(`ffmpeg failed for file ${fileId}: ${r.stderr.trim().split('\n').slice(-2).join(' ')}`);
    return r.code === 0 && fs.existsSync(args[args.length - 1]);   // last argument = output file (absolute path)
  }

  private async set(fileId: number, fields: Record<string, any>) {
    const keys = Object.keys(fields);
    if (!keys.length) return;
    const values = keys.map(k => (k === 'media_info' && fields[k] != null ? JSON.stringify(fields[k]) : fields[k]));
    await this.db.query(
      `UPDATE files SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
      [fileId, ...values],
    );
  }
}