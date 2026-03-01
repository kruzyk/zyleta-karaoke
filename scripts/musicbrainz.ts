import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ParsedSong } from './filename-parser.js';

interface Song {
  id: string;
  artist: string;
  title: string;
}

interface MBRecording {
  title: string;
  score: number;
  'artist-credit'?: Array<{
    artist: {
      name: string;
    };
  }>;
}

interface MBResponse {
  recordings?: MBRecording[];
}

const RATE_LIMIT_MS = 1100; // Slightly over 1s to be safe
const CACHE_FILE = path.join(path.dirname(new URL(import.meta.url).pathname), 'cache.json');
const USER_AGENT = 'ZyletaKaraoke/1.0 (https://github.com/zyletakaraoke)';
const MAX_RETRIES = 3;

let cache: Record<string, Song> = {};

async function loadCache(): Promise<void> {
  try {
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    cache = JSON.parse(data);
  } catch {
    cache = {};
  }
}

async function saveCache(): Promise<void> {
  await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generateId(artist: string, title: string): string {
  return `${artist}-${title}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function queryMusicBrainz(artist: string, title: string): Promise<MBResponse> {
  const query = encodeURIComponent(`recording:"${title}" AND artist:"${artist}"`);
  const url = `https://musicbrainz.org/ws/2/recording?query=${query}&fmt=json&limit=3`;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await httpGet(url);
      return JSON.parse(response) as MBResponse;
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
      console.warn(`   Retry ${attempt}/${MAX_RETRIES} for: ${artist} - ${title}`);
      await sleep(RATE_LIMIT_MS * attempt); // Exponential backoff
    }
  }
  throw new Error('Max retries exceeded');
}

function httpGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
      if (res.statusCode === 503) {
        reject(new Error('Rate limited (503)'));
        return;
      }
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

function processResponse(parsed: ParsedSong, response: MBResponse): Song {
  const recordings = response.recordings;
  if (!recordings || recordings.length === 0) {
    return fallback(parsed);
  }

  // Find best match (highest score)
  const best = recordings[0];
  if (best.score < 50) {
    return fallback(parsed);
  }

  const artistName = best['artist-credit']?.[0]?.artist?.name;
  const songTitle = best.title;

  return {
    id: generateId(artistName || parsed.artist, songTitle || parsed.title),
    artist: artistName || parsed.artist,
    title: songTitle || parsed.title,
  };
}

function fallback(parsed: ParsedSong): Song {
  return {
    id: generateId(parsed.artist, parsed.title),
    artist: parsed.artist,
    title: parsed.title,
  };
}

export async function resolveSongs(parsed: ParsedSong[]): Promise<Song[]> {
  await loadCache();
  const results: Song[] = [];
  let apiCalls = 0;
  let cacheHits = 0;

  for (let i = 0; i < parsed.length; i++) {
    const song = parsed[i];
    const cacheKey = `${song.artist.toLowerCase()}||${song.title.toLowerCase()}`;

    // Check cache first
    if (cache[cacheKey]) {
      results.push(cache[cacheKey]);
      cacheHits++;
      continue;
    }

    // Rate limit
    if (apiCalls > 0) {
      await sleep(RATE_LIMIT_MS);
    }

    try {
      const response = await queryMusicBrainz(song.artist, song.title);
      const resolved = processResponse(song, response);
      results.push(resolved);
      cache[cacheKey] = resolved;
      apiCalls++;
    } catch (error) {
      console.warn(`   ⚠ Failed: ${song.artist} - ${song.title}: ${error instanceof Error ? error.message : error}`);
      const fb = fallback(song);
      results.push(fb);
    }

    // Progress + periodic cache save
    if ((i + 1) % 50 === 0) {
      console.log(`   Progress: ${i + 1}/${parsed.length} (${apiCalls} API calls, ${cacheHits} cache hits)`);
      await saveCache();
    }
  }

  await saveCache();
  console.log(`   Total: ${apiCalls} API calls, ${cacheHits} cache hits`);
  return results;
}
