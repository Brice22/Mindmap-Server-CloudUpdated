import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class KeyDBService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KeyDBService.name);
  private client: RedisClientType;
  private connected = false;

  constructor(private config: ConfigService) {}

  async onModuleInit() {
    try {
      this.client = createClient({
        url: this.config.get('KEYDB_URL') || 'redis://keydb:6379',
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 3) return false;
            return 3000;
          },
        },
      });

      this.client.on('error', (err) => {
        this.logger.warn('KeyDB error: ' + err.message);
      });

      await this.client.connect();
      this.connected = true;
      this.logger.log('KeyDB connection successful');
    } catch (e: any) {
      this.logger.warn('KeyDB not available: ' + e.message);
    }
  }

  async onModuleDestroy() {
    if (this.client && this.connected) {
      await this.client.quit();
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  // --- Basic key/value ---
  async get(key: string): Promise<string | null> {
    if (!this.connected) return null;
    try {
      return await this.client.get(key) || null;
    } catch { return null; }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (!this.connected) return;
    try {
      if (ttlSeconds) {
        await this.client.setEx(key, ttlSeconds, value);
      } else {
        await this.client.set(key, value);
      }
    } catch (e: any) {
      this.logger.warn('KeyDB set failed: ' + e.message);
    }
  }

  async del(key: string): Promise<void> {
    if (!this.connected) return;
    try {
      await this.client.del(key);
    } catch {}
  }

  // --- Cache helper: get or fetch ---
  async cached<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
    if (this.connected) {
      try {
        const hit = await this.client.get(key);
        if (hit && typeof hit === 'string') return JSON.parse(hit);
      } catch {}
    }

    const result = await fetcher();

    if (this.connected) {
      try {
        await this.client.setEx(key, ttlSeconds, JSON.stringify(result));
      } catch {}
    }

    return result;
  }

  // --- Buffer node position during drag ---
  async bufferNodePosition(nodeId: number, x: number, y: number): Promise<void> {
    await this.set(`node:pos:${nodeId}`, JSON.stringify({ x, y }), 60);
  }

  async getBufferedPosition(nodeId: number): Promise<{ x: number; y: number } | null> {
    const val = await this.get(`node:pos:${nodeId}`);
    return val ? JSON.parse(val) : null;
  }

  // --- Invalidate cache when data changes ---
  async invalidateNodeCache(): Promise<void> {
    await this.del('cache:all_nodes');
  }
}