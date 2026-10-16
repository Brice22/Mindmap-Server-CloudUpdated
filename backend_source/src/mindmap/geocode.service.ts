// ============================================================
// GEOCODE SERVICE - place search for the Map and /place in Docs
// ============================================================
// Looks up cities, regions, addresses and venues with OpenStreetMap's
// public Nominatim service, through the backend so that:
//   - the browser never talks to Nominatim directly
//   - requests carry an identifying User-Agent (Nominatim's rule)
//   - at most 1 request per second is sent (Nominatim's rule)
//   - repeated searches come from an in-memory cache
// Returns each result's centre, bounding box and (for cities and
// regions) a simplified outline, so a node can be "zoomed into" it.
// Later this can point at a self-hosted Nominatim/Photon instead
// (set GEOCODER_URL).
// ============================================================

import { Injectable, Logger } from '@nestjs/common';

export interface GeoResult {
  label: string;                     // full display name
  name: string;                      // short name (e.g. "Chicago")
  type: string;                      // city, administrative, cafe, ...
  lat: number;
  lng: number;
  bbox: [number, number, number, number] | null;   // [south, north, west, east]
  geojson: any | null;               // outline (Polygon/MultiPolygon) or null for points
}

const BASE_URL = process.env.GEOCODER_URL || 'https://nominatim.openstreetmap.org';
const MAX_CACHE = 500;

@Injectable()
export class GeocodeService {
  private readonly logger = new Logger(GeocodeService.name);
  private cache = new Map<string, GeoResult[]>();
  private last = 0;
  private chain: Promise<unknown> = Promise.resolve();

  async search(query: string): Promise<GeoResult[]> {
    const q = String(query || '').trim();
    if (q.length < 2) return [];
    const key = q.toLowerCase();
    const hit = this.cache.get(key);
    if (hit) return hit;

    // One request at a time, at least 1.1 s apart
    const run = this.chain.then(async () => {
      const wait = this.last + 1100 - Date.now();
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      this.last = Date.now();
      return this.fetchResults(q);
    });
    this.chain = run.catch(() => {});
    const results = await run;
    if (!results) return [];          // lookup failed — don't cache, try again next time

    if (this.cache.size >= MAX_CACHE) this.cache.delete(this.cache.keys().next().value as string);
    this.cache.set(key, results);
    return results;
  }

  private async fetchResults(q: string): Promise<GeoResult[] | null> {
    const url = `${BASE_URL}/search?format=jsonv2&limit=6&polygon_geojson=1&polygon_threshold=0.005&q=${encodeURIComponent(q)}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'HServer-Mindmap/1.0 (self-hosted personal knowledge map)', 'Accept-Language': 'en' },
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows: any[] = await res.json();
      return rows.map(r => {
        const bb = Array.isArray(r.boundingbox) ? r.boundingbox.map(Number) : null;
        const shape = r.geojson && ['Polygon', 'MultiPolygon'].includes(r.geojson.type) ? r.geojson : null;
        return {
          label: r.display_name,
          name: r.name || String(r.display_name || '').split(',')[0],
          type: r.type || r.category || 'place',
          lat: Number(r.lat),
          lng: Number(r.lon),
          bbox: bb && bb.length === 4 ? [bb[0], bb[1], bb[2], bb[3]] as [number, number, number, number] : null,
          geojson: shape,
        };
      });
    } catch (e: any) {
      this.logger.warn(`Place search failed for "${q}": ${e.message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}