/**
 * MusicBrainz API provider — wrapper around existing musicbrainz.ts logic,
 * adapted to the MusicApiProvider interface.
 *
 * Rate limits: 1 request/second (MusicBrainz TOS)
 * No authentication required, but User-Agent is mandatory.
 *
 * API docs: https://musicbrainz.org/doc/MusicBrainz_API
 */

import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { MusicApiProvider, ApiMatch } from './types.js';

const RATE_LIMIT_MS = 1100;
const USER_AGENT = 'ZyletaKaraoke/1.0 (https://github.com/kruzyk/zyleta-karaoke)';
const MAX_RETRIES = 3;

interface MBCacheEntry {
  match: ApiMatch | null;
  artistMbid?: string;
  cachedAt: string;
}

interface ArtistCacheEntry {
  country?: string;
  cachedAt: string;
}

export class MusicBrainzProvider implements MusicApiProvider {
  readonly name = 'musicbrainz';
  private songCache: Record<string, MBCacheEntry> = {};
  private artistCache: Record<string, ArtistCacheEntry> = {};
  private songCacheFile: string;
  private artistCacheFile: string;
  private lastRequestTime = 0;

  constructor(cacheDir?: string) {
    const dir = cacheDir || path.dirname(new URL(import.meta.url).pathname);
    this.songCacheFile = path.join(dir, '..', 'cache.json');
    this.artistCacheFile = path.join(dir, '..', 'artist-cache.json');
  }

  async init(): Promise<void> {
    try {
      const data = await fs.readFile(this.songCacheFile, 'utf-8');
      // Convert old cache format to new if needed
      const raw = JSON.parse(data);
      // Old cache: { key: { id, artist, title, country?, year?, artistMbid? } }
      // New cache: { key: { match: ApiMatch | null, artistMbid?, cachedAt } }
      for (const [key, value] of Object.entries(raw)) {
        const v = value as any;
        if (v.match !== undefined) {
          this.songCache[key] = v;
        } else {
          // Old format — convert
          this.songCache[key] = {
            match: {
              artist: v.artist,
              title: v.title,
              confidence: 80, // Assume decent confidence for cached entries
              year: v.year,
              country: v.country,
              source: 'musicbrainz',
              sourceId: v.id,
            },
            artistMbid: v.artistMbid,
            cachedAt: v.cachedAt || new Date().toISOString(),
          };
        }
      }
      console.log(`   [MusicBrainz] Song cache loaded: ${Object.keys(this.songCache).length} entries`);
    } catch {
      this.songCache = {};
    }
    try {
      const data = await fs.readFile(this.artistCacheFile, 'utf-8');
      this.artistCache = JSON.parse(data);
      console.log(`   [MusicBrainz] Artist cache loaded: ${Object.keys(this.artistCache).length} entries`);
    } catch {
      this.artistCache = {};
    }
  }

  async saveCache(): Promise<void> {
    await Promise.all([
      fs.writeFile(this.songCacheFile, JSON.stringify(this.songCache, null, 2), 'utf-8'),
      fs.writeFile(this.artistCacheFile, JSON.stringify(this.artistCache, null, 2), 'utf-8'),
    ]);
  }

  async search(artist: string, title: string): Promise<ApiMatch | null> {
    const cacheKey = `${artist.toLowerCase()}||${title.toLowerCase()}`;
    if (this.songCache[cacheKey]) {
      return this.songCache[cacheKey].match;
    }

    await this.rateLimit();

    try {
      const result = await this.searchRecording(artist, title);

      // If we got a result with an artist MBID but no country, try to resolve it
      if (result && result.sourceId && !result.country) {
        const artistMbid = result.sourceId.split('::')[0]; // We encode mbid::recId
        if (artistMbid && !this.artistCache[artistMbid]) {
          await this.rateLimit();
          const country = await this.lookupArtistCountry(artistMbid);
          this.artistCache[artistMbid] = { country, cachedAt: new Date().toISOString() };
          if (country) result.country = country;
        } else if (artistMbid && this.artistCache[artistMbid]?.country) {
          result.country = this.artistCache[artistMbid].country;
        }
      }

      this.songCache[cacheKey] = {
        match: result,
        artistMbid: result?.sourceId?.split('::')[0],
        cachedAt: new Date().toISOString(),
      };
      return result;
    } catch (error) {
      console.warn(`   [MusicBrainz] Search failed for "${artist} - ${title}": ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }

  private async searchRecording(artist: string, title: string): Promise<ApiMatch | null> {
    const query = encodeURIComponent(`recording:"${title}" AND artist:"${artist}"`);
    const url = `https://musicbrainz.org/ws/2/recording?query=${query}&fmt=json&limit=3`;
    const response = await this.fetchWithRetry(url);
    const data = JSON.parse(response);

    const recordings = data.recordings;
    if (!recordings || recordings.length === 0 || recordings[0].score < 50) {
      return null;
    }

    const best = recordings[0];
    const credit = best['artist-credit']?.[0];
    const mbArtistName = credit?.artist?.name || artist;
    const artistMbid = credit?.artist?.id || '';
    const mbTitle = best.title || title;
    const year = this.extractYear(best);

    return {
      artist: mbArtistName,
      title: mbTitle,
      confidence: best.score,
      year,
      source: 'musicbrainz',
      sourceId: `${artistMbid}::${best.id || ''}`,
    };
  }

  private async lookupArtistCountry(mbid: string): Promise<string | undefined> {
    try {
      const url = `https://musicbrainz.org/ws/2/artist/${mbid}?fmt=json`;
      const response = await this.fetchWithRetry(url);
      const data = JSON.parse(response);
      const areaCodes = data.area?.['iso-3166-1-codes'];
      if (areaCodes && areaCodes.length > 0) return areaCodes[0];
      const beginCodes = data['begin-area']?.['iso-3166-1-codes'];
      if (beginCodes && beginCodes.length > 0) return beginCodes[0];
      return undefined;
    } catch {
      return undefined;
    }
  }

  private extractYear(recording: any): number | undefined {
    const candidates: number[] = [];
    const recDate = recording['first-release-date'];
    if (recDate) {
      const y = parseInt(recDate.substring(0, 4), 10);
      if (!isNaN(y) && y > 1900) candidates.push(y);
    }
    if (recording.releases) {
      for (const rel of recording.releases) {
        const rgDate = rel['release-group']?.['first-release-date'];
        if (rgDate) {
          const y = parseInt(rgDate.substring(0, 4), 10);
          if (!isNaN(y) && y > 1900) candidates.push(y);
        }
        if (rel.date) {
          const y = parseInt(rel.date.substring(0, 4), 10);
          if (!isNaN(y) && y > 1900) candidates.push(y);
        }
      }
    }
    return candidates.length > 0 ? Math.min(...candidates) : undefined;
  }

  private async rateLimit(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < RATE_LIMIT_MS) {
      await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  private async fetchWithRetry(url: string): Promise<string> {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this.httpGet(url);
      } catch (error) {
        if (attempt === MAX_RETRIES) throw error;
        await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS * attempt * 2));
      }
    }
    throw new Error('Max retries exceeded');
  }

  private httpGet(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
        if (res.statusCode === 503) {
          reject(new Error('Rate limited (503)'));
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
