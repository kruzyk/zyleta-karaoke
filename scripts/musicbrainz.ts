import https from 'node:https';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ParsedSong } from './filename-parser.js';

export interface Song {
  id: string;
  artist: string;
  title: string;
  country?: string;
  year?: number;
}

// --- MusicBrainz API types ---

interface MBArtistCredit {
  artist: {
    id: string;
    name: string;
  };
}

interface MBRelease {
  date?: string;
  'release-group'?: {
    'first-release-date'?: string;
  };
}

interface MBRecording {
  title: string;
  score: number;
  'first-release-date'?: string;
  'artist-credit'?: MBArtistCredit[];
  releases?: MBRelease[];
}

interface MBSearchResponse {
  recordings?: MBRecording[];
}

interface MBArtistArea {
  'iso-3166-1-codes'?: string[];
}

interface MBArtistDetail {
  id: string;
  name: string;
  area?: MBArtistArea;
  'begin-area'?: MBArtistArea;
}

// --- Cache types ---

interface ArtistCache {
  country?: string;
}

interface SongCache {
  id: string;
  artist: string;
  title: string;
  country?: string;
  year?: number;
  artistMbid?: string;
}

// --- Constants ---

const RATE_LIMIT_MS = 1100;
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const SONG_CACHE_FILE = path.join(SCRIPT_DIR, 'cache.json');
const ARTIST_CACHE_FILE = path.join(SCRIPT_DIR, 'artist-cache.json');
const USER_AGENT = 'ZyletaKaraoke/1.0 (https://github.com/kruzyk/zyleta-karaoke)';
const MAX_RETRIES = 3;

let songCache: Record<string, SongCache> = {};
let artistCache: Record<string, ArtistCache> = {};

// --- Cache I/O ---

async function loadCaches(): Promise<void> {
  try {
    const data = await fs.readFile(SONG_CACHE_FILE, 'utf-8');
    songCache = JSON.parse(data);
  } catch {
    songCache = {};
  }
  try {
    const data = await fs.readFile(ARTIST_CACHE_FILE, 'utf-8');
    artistCache = JSON.parse(data);
  } catch {
    artistCache = {};
  }
}

async function saveCaches(): Promise<void> {
  await fs.writeFile(SONG_CACHE_FILE, JSON.stringify(songCache, null, 2), 'utf-8');
  await fs.writeFile(ARTIST_CACHE_FILE, JSON.stringify(artistCache, null, 2), 'utf-8');
}

// --- HTTP & rate limiting ---

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function fetchWithRetry(url: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await httpGet(url);
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
      await sleep(RATE_LIMIT_MS * attempt);
    }
  }
  throw new Error('Max retries exceeded');
}

// --- MusicBrainz API calls ---

async function searchRecording(artist: string, title: string): Promise<MBSearchResponse> {
  const query = encodeURIComponent(`recording:"${title}" AND artist:"${artist}"`);
  const url = `https://musicbrainz.org/ws/2/recording?query=${query}&fmt=json&limit=3`;
  const response = await fetchWithRetry(url);
  return JSON.parse(response) as MBSearchResponse;
}

async function lookupArtist(mbid: string): Promise<MBArtistDetail | null> {
  // Check artist cache first
  if (artistCache[mbid] !== undefined) {
    return null; // Signal that we have cache — caller reads artistCache directly
  }

  const url = `https://musicbrainz.org/ws/2/artist/${mbid}?fmt=json`;
  await sleep(RATE_LIMIT_MS);

  try {
    const response = await fetchWithRetry(url);
    return JSON.parse(response) as MBArtistDetail;
  } catch (error) {
    console.warn(`   Artist lookup failed for ${mbid}: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

// --- Data extraction ---

function generateId(artist: string, title: string): string {
  return `${artist}-${title}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function extractYear(recording: MBRecording): number | undefined {
  // Try first-release-date on recording
  const recDate = recording['first-release-date'];
  if (recDate) {
    const y = parseInt(recDate.substring(0, 4), 10);
    if (!isNaN(y) && y > 1900) return y;
  }

  // Try releases
  if (recording.releases) {
    for (const rel of recording.releases) {
      const rgDate = rel['release-group']?.['first-release-date'];
      if (rgDate) {
        const y = parseInt(rgDate.substring(0, 4), 10);
        if (!isNaN(y) && y > 1900) return y;
      }
      if (rel.date) {
        const y = parseInt(rel.date.substring(0, 4), 10);
        if (!isNaN(y) && y > 1900) return y;
      }
    }
  }

  return undefined;
}

function extractCountryFromArtist(detail: MBArtistDetail): string | undefined {
  // area.iso-3166-1-codes is the most reliable source
  const areaCodes = detail.area?.['iso-3166-1-codes'];
  if (areaCodes && areaCodes.length > 0) {
    return areaCodes[0];
  }

  // begin-area as fallback
  const beginCodes = detail['begin-area']?.['iso-3166-1-codes'];
  if (beginCodes && beginCodes.length > 0) {
    return beginCodes[0];
  }

  return undefined;
}

// --- Main processing ---

async function resolveArtistCountry(mbid: string): Promise<string | undefined> {
  // Check cache
  if (artistCache[mbid] !== undefined) {
    return artistCache[mbid].country;
  }

  const detail = await lookupArtist(mbid);
  if (detail) {
    const country = extractCountryFromArtist(detail);
    artistCache[mbid] = { country };
    return country;
  }

  // Mark as looked up (no result) to avoid re-fetching
  artistCache[mbid] = { country: undefined };
  return undefined;
}

async function processRecording(parsed: ParsedSong, response: MBSearchResponse): Promise<Song> {
  const recordings = response.recordings;
  if (!recordings || recordings.length === 0) {
    return fallback(parsed);
  }

  const best = recordings[0];
  if (best.score < 50) {
    return fallback(parsed);
  }

  const credit = best['artist-credit']?.[0];
  const artistName = credit?.artist?.name || parsed.artist;
  const artistMbid = credit?.artist?.id;
  const songTitle = best.title || parsed.title;
  const year = extractYear(best);

  // Look up artist country via separate API call (cached per artist)
  let country: string | undefined;
  if (artistMbid) {
    country = await resolveArtistCountry(artistMbid);
  }

  const song: Song = {
    id: generateId(artistName, songTitle),
    artist: artistName,
    title: songTitle,
  };

  if (country) song.country = country;
  if (year) song.year = year;

  return song;
}

function fallback(parsed: ParsedSong): Song {
  return {
    id: generateId(parsed.artist, parsed.title),
    artist: parsed.artist,
    title: parsed.title,
  };
}

export async function resolveSongs(parsed: ParsedSong[]): Promise<Song[]> {
  await loadCaches();
  const results: Song[] = [];
  let apiCalls = 0;
  let artistLookups = 0;
  let cacheHits = 0;
  let withCountry = 0;
  let withYear = 0;

  // Track unique artist MBIDs to report stats
  const seenArtistMbids = new Set<string>();

  for (let i = 0; i < parsed.length; i++) {
    const song = parsed[i];
    const cacheKey = `${song.artist.toLowerCase()}||${song.title.toLowerCase()}`;

    // Check song cache first
    if (songCache[cacheKey]) {
      const cached = songCache[cacheKey];
      results.push({
        id: cached.id,
        artist: cached.artist,
        title: cached.title,
        ...(cached.country ? { country: cached.country } : {}),
        ...(cached.year ? { year: cached.year } : {}),
      });
      cacheHits++;
      if (cached.country) withCountry++;
      if (cached.year) withYear++;
      continue;
    }

    // Rate limit between recording searches
    if (apiCalls > 0) {
      await sleep(RATE_LIMIT_MS);
    }

    try {
      const response = await searchRecording(song.artist, song.title);
      apiCalls++;

      const resolved = await processRecording(song, response);
      results.push(resolved);

      // Track artist lookups
      const mbid = response.recordings?.[0]?.['artist-credit']?.[0]?.artist?.id;
      if (mbid && !seenArtistMbids.has(mbid)) {
        seenArtistMbids.add(mbid);
        if (!artistCache[mbid] || artistCache[mbid] === undefined) {
          artistLookups++;
        }
      }

      // Update song cache
      songCache[cacheKey] = {
        id: resolved.id,
        artist: resolved.artist,
        title: resolved.title,
        country: resolved.country,
        year: resolved.year,
        artistMbid: mbid,
      };

      if (resolved.country) withCountry++;
      if (resolved.year) withYear++;
    } catch (error) {
      console.warn(`   Failed: ${song.artist} - ${song.title}: ${error instanceof Error ? error.message : error}`);
      const fb = fallback(song);
      results.push(fb);
    }

    // Progress + periodic cache save
    if ((i + 1) % 25 === 0) {
      console.log(`   Progress: ${i + 1}/${parsed.length} | ${apiCalls} recordings, ${artistLookups} artists, ${cacheHits} cached | ${withCountry} country, ${withYear} year`);
      await saveCaches();
    }
  }

  await saveCaches();
  console.log(`   Total: ${apiCalls} recording searches, ${artistLookups} artist lookups, ${cacheHits} cache hits`);
  console.log(`   Unique artists: ${seenArtistMbids.size}`);
  console.log(`   Metadata: ${withCountry}/${results.length} with country, ${withYear}/${results.length} with year`);
  return results;
}
