/**
 * Last.fm API provider for the multi-API verification service.
 *
 * Uses track.getInfo for precise artist+title lookup with rich metadata:
 * tags/genres, listeners count, MusicBrainz ID, duration.
 *
 * Rate limits: ~5 requests/second (no official hard limit, but be polite)
 * Authentication: free API key required
 *
 * Setup:
 *   1. Create account at https://www.last.fm/api/account/create
 *   2. Get your API key from https://www.last.fm/api/accounts
 *   3. Set LASTFM_API_KEY environment variable (or add as GitHub secret)
 *
 * API docs: https://www.last.fm/api/show/track.getInfo
 *           https://www.last.fm/api/show/track.search
 */

import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { MusicApiProvider, ApiMatch } from './types.js';

const RATE_LIMIT_MS = 250; // ~4 req/sec — conservative but safe
const USER_AGENT = 'ZyletaKaraoke/1.0 (https://github.com/kruzyk/zyleta-karaoke)';
const BASE_URL = 'https://ws.audioscrobbler.com/2.0/';

interface LastfmCacheEntry {
  match: ApiMatch | null;
  cachedAt: string;
}

export class LastfmProvider implements MusicApiProvider {
  readonly name = 'lastfm';
  private apiKey: string;
  private cache: Record<string, LastfmCacheEntry> = {};
  private cacheFile: string;
  private lastRequestTime = 0;

  constructor(apiKey?: string, cacheDir?: string) {
    this.apiKey = apiKey || process.env.LASTFM_API_KEY || '';
    const dir = cacheDir || path.dirname(new URL(import.meta.url).pathname);
    this.cacheFile = path.join(dir, '..', 'lastfm-cache.json');
  }

  async init(): Promise<void> {
    if (!this.apiKey) {
      console.warn('   [Last.fm] No API key set (LASTFM_API_KEY). Provider disabled.');
      return;
    }
    try {
      const data = await fs.readFile(this.cacheFile, 'utf-8');
      this.cache = JSON.parse(data);
      console.log(`   [Last.fm] Cache loaded: ${Object.keys(this.cache).length} entries`);
    } catch {
      this.cache = {};
    }
  }

  async saveCache(): Promise<void> {
    await fs.writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2), 'utf-8');
  }

  async search(artist: string, title: string): Promise<ApiMatch | null> {
    if (!this.apiKey) return null;

    const cacheKey = `${artist.toLowerCase()}||${title.toLowerCase()}`;
    if (this.cache[cacheKey]) {
      return this.cache[cacheKey].match;
    }

    await this.rateLimit();

    try {
      const result = await this.getTrackInfo(artist, title);
      this.cache[cacheKey] = { match: result, cachedAt: new Date().toISOString() };
      return result;
    } catch (error) {
      // track.getInfo failed — fall back to track.search
      try {
        await this.rateLimit();
        const result = await this.searchTrack(artist, title);
        this.cache[cacheKey] = { match: result, cachedAt: new Date().toISOString() };
        return result;
      } catch (searchError) {
        console.warn(`   [Last.fm] Search failed for "${artist} - ${title}": ${searchError instanceof Error ? searchError.message : searchError}`);
        this.cache[cacheKey] = { match: null, cachedAt: new Date().toISOString() };
        return null;
      }
    }
  }

  /**
   * Use track.getInfo for precise lookup — returns rich metadata.
   */
  private async getTrackInfo(artist: string, title: string): Promise<ApiMatch | null> {
    const params = new URLSearchParams({
      method: 'track.getInfo',
      artist,
      track: title,
      api_key: this.apiKey,
      format: 'json',
    });

    const response = await this.httpGet(`${BASE_URL}?${params}`);
    const data = JSON.parse(response);

    if (data.error) {
      throw new Error(`Last.fm API error ${data.error}: ${data.message}`);
    }

    const track = data.track;
    if (!track) return null;

    // Extract tags as genres
    const tags: string[] = [];
    if (track.toptags?.tag) {
      for (const tag of track.toptags.tag) {
        if (tag.name) tags.push(tag.name);
      }
    }

    // Last.fm track.getInfo doesn't return a score, but if it found the track
    // it's typically a good match. We'll give it 85 base confidence.
    const confidence = 85;

    return {
      artist: track.artist?.name || artist,
      title: track.name || title,
      confidence,
      genres: tags.length > 0 ? tags : undefined,
      source: 'lastfm',
      sourceId: track.mbid || undefined,
    };
  }

  /**
   * Fallback: use track.search for fuzzy matching.
   */
  private async searchTrack(artist: string, title: string): Promise<ApiMatch | null> {
    const params = new URLSearchParams({
      method: 'track.search',
      track: title,
      artist,
      api_key: this.apiKey,
      format: 'json',
      limit: '5',
    });

    const response = await this.httpGet(`${BASE_URL}?${params}`);
    const data = JSON.parse(response);

    const matches = data.results?.trackmatches?.track;
    if (!matches || matches.length === 0) return null;

    const best = matches[0];

    // Calculate confidence based on string similarity
    const artistSim = stringSimilarity(artist.toLowerCase(), (best.artist || '').toLowerCase());
    const titleSim = stringSimilarity(title.toLowerCase(), (best.name || '').toLowerCase());
    const confidence = Math.round((artistSim * 0.5 + titleSim * 0.5) * 100);

    if (confidence < 40) return null;

    return {
      artist: best.artist || artist,
      title: best.name || title,
      confidence,
      source: 'lastfm',
      sourceId: best.mbid || undefined,
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
      const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
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
 * Dice coefficient on bigrams — 0-1 where 1 = identical.
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
