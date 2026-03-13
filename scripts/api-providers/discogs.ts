/**
 * Discogs API provider for the multi-API verification service.
 *
 * Uses the Discogs database search endpoint to find recordings.
 * Requires a Discogs API key+secret or personal access token.
 *
 * Rate limits:
 *   - Authenticated: 60 requests/minute
 *   - Unauthenticated: 25 requests/minute
 *
 * Setup:
 *   1. Create an account at https://www.discogs.com
 *   2. Go to Settings → Developers → Generate new token
 *   3. Set DISCOGS_TOKEN environment variable (or add as GitHub secret)
 *
 * API docs: https://www.discogs.com/developers/
 */

import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { MusicApiProvider, ApiMatch } from './types.js';

const RATE_LIMIT_MS = 1100; // ~55 req/min to stay safely under 60/min limit
const USER_AGENT = 'ZyletaKaraoke/1.0 +https://github.com/kruzyk/zyleta-karaoke';
const MAX_RETRIES = 3;

interface DiscogsCacheEntry {
  match: ApiMatch | null;
  cachedAt: string;
}

export class DiscogsProvider implements MusicApiProvider {
  readonly name = 'discogs';
  private token: string;
  private cache: Record<string, DiscogsCacheEntry> = {};
  private cacheFile: string;
  private lastRequestTime = 0;

  constructor(token?: string, cacheDir?: string) {
    this.token = token || process.env.DISCOGS_TOKEN || '';
    const dir = cacheDir || path.dirname(new URL(import.meta.url).pathname);
    this.cacheFile = path.join(dir, '..', 'discogs-cache.json');
  }

  async init(): Promise<void> {
    if (!this.token) {
      console.warn('   [Discogs] No token set (DISCOGS_TOKEN). Running unauthenticated (25 req/min).');
    }
    try {
      const data = await fs.readFile(this.cacheFile, 'utf-8');
      this.cache = JSON.parse(data);
      console.log(`   [Discogs] Cache loaded: ${Object.keys(this.cache).length} entries`);
    } catch {
      this.cache = {};
    }
  }

  async saveCache(): Promise<void> {
    await fs.writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2), 'utf-8');
  }

  async search(artist: string, title: string): Promise<ApiMatch | null> {
    const cacheKey = `${artist.toLowerCase()}||${title.toLowerCase()}`;
    if (this.cache[cacheKey]) {
      return this.cache[cacheKey].match;
    }

    await this.rateLimit();

    try {
      const result = await this.searchRelease(artist, title);
      this.cache[cacheKey] = { match: result, cachedAt: new Date().toISOString() };
      return result;
    } catch (error) {
      console.warn(`   [Discogs] Search failed for "${artist} - ${title}": ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private async searchRelease(artist: string, title: string): Promise<ApiMatch | null> {
    // Search by artist + track name
    const query = encodeURIComponent(`${artist} ${title}`);
    const url = `https://api.discogs.com/database/search?q=${query}&type=release&per_page=5`;

    const response = await this.httpGet(url);
    const data = JSON.parse(response);

    if (!data.results || data.results.length === 0) {
      return null;
    }

    // Find the best match - Discogs returns results sorted by relevance
    const best = data.results[0];

    // Discogs title format is "Artist - Title"
    const titleParts = (best.title || '').split(' - ');
    const discogsArtist = titleParts[0]?.trim() || '';
    const discogsTitle = titleParts.slice(1).join(' - ').trim() || best.title || '';

    // Calculate confidence based on string similarity
    const artistSimilarity = stringSimilarity(artist.toLowerCase(), discogsArtist.toLowerCase());
    const titleSimilarity = stringSimilarity(title.toLowerCase(), discogsTitle.toLowerCase());
    const confidence = Math.round((artistSimilarity * 0.6 + titleSimilarity * 0.4) * 100);

    if (confidence < 40) {
      return null; // Too low to be useful
    }

    return {
      artist: discogsArtist,
      title: discogsTitle,
      confidence,
      year: best.year ? parseInt(best.year, 10) : undefined,
      country: best.country || undefined,
      genres: [...(best.genre || []), ...(best.style || [])],
      source: 'discogs',
      sourceId: String(best.id),
    };
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
      if (this.token) {
        headers['Authorization'] = `Discogs token=${this.token}`;
      }

      const req = https.get(url, { headers }, (res) => {
        if (res.statusCode === 429) {
          reject(new Error('Rate limited (429)'));
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0, 200)}`)));
          return;
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }
}

/**
 * Simple string similarity (Dice coefficient on bigrams).
 * Returns 0-1 where 1 = identical.
 */
function stringSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const bigramsA = new Set<string>();
  for (let i = 0; i < a.length - 1; i++) bigramsA.add(a.substring(i, i + 2));

  let matches = 0;
  for (let i = 0; i < b.length - 1; i++) {
    if (bigramsA.has(b.substring(i, i + 2))) matches++;
  }

  return (2 * matches) / (a.length - 1 + b.length - 1);
}
