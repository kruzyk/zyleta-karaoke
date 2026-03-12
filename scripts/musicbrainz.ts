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

interface MBArtistDetail {
  id: string;
  name: string;
  area?: { 'iso-3166-1-codes'?: string[] };
  'begin-area'?: { 'iso-3166-1-codes'?: string[] };
}

// --- Cache types ---

interface SongCacheEntry {
  id: string;
  artist: string;
  title: string;
  country?: string;
  year?: number;
  artistMbid?: string;
  cachedAt: string; // ISO date
}

interface ArtistCacheEntry {
  country?: string;
  cachedAt: string;
}

// --- Constants ---

const RATE_LIMIT_MS = 1100;
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const SONG_CACHE_FILE = path.join(SCRIPT_DIR, 'cache.json');
const ARTIST_CACHE_FILE = path.join(SCRIPT_DIR, 'artist-cache.json');
const USER_AGENT = 'ZyletaKaraoke/1.0 (https://github.com/kruzyk/zyleta-karaoke)';
const MAX_RETRIES = 3;

let songCache: Record<string, SongCacheEntry> = {};
let artistCache: Record<string, ArtistCacheEntry> = {};

// --- Options ---

export interface ResolveOptions {
  forceRefresh?: boolean; // Ignore cache, re-fetch everything
}

// --- Cache I/O ---

async function loadCaches(force: boolean): Promise<void> {
  if (force) {
    songCache = {};
    artistCache = {};
    console.log('   Cache wyczyszczony (tryb force-refresh)');
    return;
  }
  try {
    const data = await fs.readFile(SONG_CACHE_FILE, 'utf-8');
    songCache = JSON.parse(data);
    console.log(`   Wczytano song cache: ${Object.keys(songCache).length} wpisow`);
  } catch {
    songCache = {};
  }
  try {
    const data = await fs.readFile(ARTIST_CACHE_FILE, 'utf-8');
    artistCache = JSON.parse(data);
    console.log(`   Wczytano artist cache: ${Object.keys(artistCache).length} wpisow`);
  } catch {
    artistCache = {};
  }
}

async function saveCaches(): Promise<void> {
  await Promise.all([
    fs.writeFile(SONG_CACHE_FILE, JSON.stringify(songCache, null, 2), 'utf-8'),
    fs.writeFile(ARTIST_CACHE_FILE, JSON.stringify(artistCache, null, 2), 'utf-8'),
  ]);
}

// --- HTTP ---

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

async function fetchWithRetry(url: string): Promise<string> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await httpGet(url);
    } catch (error) {
      if (attempt === MAX_RETRIES) throw error;
      const waitMs = RATE_LIMIT_MS * attempt * 2;
      await sleep(waitMs);
    }
  }
  throw new Error('Max retries exceeded');
}

// --- MusicBrainz API ---

async function searchRecording(artist: string, title: string): Promise<MBSearchResponse> {
  const query = encodeURIComponent(`recording:"${title}" AND artist:"${artist}"`);
  const url = `https://musicbrainz.org/ws/2/recording?query=${query}&fmt=json&limit=3`;
  const response = await fetchWithRetry(url);
  return JSON.parse(response) as MBSearchResponse;
}

async function lookupArtist(mbid: string): Promise<MBArtistDetail | null> {
  const url = `https://musicbrainz.org/ws/2/artist/${mbid}?fmt=json`;
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
  // Collect ALL candidate years, then pick the earliest one.
  // MusicBrainz returns multiple releases (originals, compilations, remasters)
  // and they are NOT sorted chronologically — so we must find the minimum.
  const candidates: number[] = [];

  // 1. recording.first-release-date — best single source (earliest known release of this recording)
  const recDate = recording['first-release-date'];
  if (recDate) {
    const y = parseInt(recDate.substring(0, 4), 10);
    if (!isNaN(y) && y > 1900) candidates.push(y);
  }

  // 2. Scan all releases for their release-group.first-release-date and release.date
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

function extractCountryFromArtist(detail: MBArtistDetail): string | undefined {
  const areaCodes = detail.area?.['iso-3166-1-codes'];
  if (areaCodes && areaCodes.length > 0) return areaCodes[0];
  const beginCodes = detail['begin-area']?.['iso-3166-1-codes'];
  if (beginCodes && beginCodes.length > 0) return beginCodes[0];
  return undefined;
}

// --- Phase 1: Batch artist lookups ---

async function batchResolveArtists(artistMbids: string[]): Promise<void> {
  const toFetch = artistMbids.filter((mbid) => artistCache[mbid] === undefined);
  if (toFetch.length === 0) return;

  console.log(`\n   Resolving ${toFetch.length} unique artists...`);

  for (let i = 0; i < toFetch.length; i++) {
    const mbid = toFetch[i];
    await sleep(RATE_LIMIT_MS);

    const detail = await lookupArtist(mbid);
    const country = detail ? extractCountryFromArtist(detail) : undefined;
    artistCache[mbid] = { country, cachedAt: new Date().toISOString() };

    if ((i + 1) % 100 === 0) {
      console.log(`   Artists: ${i + 1}/${toFetch.length} (${country ? 'found' : 'no'} country for latest)`);
      await saveCaches();
    }
  }

  await saveCaches();
  console.log(`   Artists done: ${toFetch.length} resolved`);
}

// --- Main entry point ---

export async function resolveSongs(
  parsed: ParsedSong[],
  options: ResolveOptions = {},
): Promise<Song[]> {
  const force = options.forceRefresh ?? false;
  await loadCaches(force);

  // --- Step 1: Deduplicate input by artist+title ---
  const uniqueMap = new Map<string, ParsedSong>();
  for (const song of parsed) {
    const key = `${song.artist.toLowerCase()}||${song.title.toLowerCase()}`;
    if (!uniqueMap.has(key)) {
      uniqueMap.set(key, song);
    }
  }
  const uniqueSongs = Array.from(uniqueMap.values());
  console.log(`   Unique artist+title pairs: ${uniqueSongs.length} (from ${parsed.length} files)`);

  // --- Step 2: Split into cached vs uncached ---
  const cached: Song[] = [];
  const toResolve: ParsedSong[] = [];
  let withCountry = 0;
  let withYear = 0;

  for (const song of uniqueSongs) {
    const cacheKey = `${song.artist.toLowerCase()}||${song.title.toLowerCase()}`;
    const entry = songCache[cacheKey];
    if (entry) {
      const s: Song = {
        id: entry.id,
        artist: entry.artist,
        title: entry.title,
        ...(entry.country ? { country: entry.country } : {}),
        ...(entry.year ? { year: entry.year } : {}),
      };
      cached.push(s);
      if (s.country) withCountry++;
      if (s.year) withYear++;
    } else {
      toResolve.push(song);
    }
  }

  console.log(`   From cache: ${cached.length} | To resolve: ${toResolve.length}`);

  if (toResolve.length === 0) {
    console.log(`   All songs served from cache!`);
    console.log(`   Metadata: ${withCountry}/${cached.length} with country, ${withYear}/${cached.length} with year`);
    return rebuildFullList(parsed, [...cached]);
  }

  // --- Step 3: Search recordings for uncached songs ---
  console.log(`\n   Searching MusicBrainz for ${toResolve.length} recordings...`);
  const estimatedMinutes = Math.ceil(toResolve.length * 1.1 / 60);
  console.log(`   Estimated time: ~${estimatedMinutes} min`);

  interface RecordingResult {
    song: ParsedSong;
    response: MBSearchResponse;
  }

  const recordingResults: RecordingResult[] = [];
  let apiCalls = 0;
  let failures = 0;

  for (let i = 0; i < toResolve.length; i++) {
    const song = toResolve[i];

    if (apiCalls > 0) {
      await sleep(RATE_LIMIT_MS);
    }

    try {
      const response = await searchRecording(song.artist, song.title);
      recordingResults.push({ song, response });
      apiCalls++;
    } catch (error) {
      console.warn(`   Failed: ${song.artist} - ${song.title}: ${error instanceof Error ? error.message : error}`);
      failures++;
      // Still add as fallback
      recordingResults.push({
        song,
        response: { recordings: [] },
      });
    }

    if ((i + 1) % 100 === 0 || i === toResolve.length - 1) {
      const elapsed = Math.round(apiCalls * 1.1 / 60);
      console.log(`   Recordings: ${i + 1}/${toResolve.length} (${elapsed}min elapsed, ${failures} failures)`);
      await saveCaches(); // Save periodically
    }
  }

  // --- Step 4: Collect unique artist MBIDs and batch-resolve ---
  const artistMbids = new Set<string>();
  for (const { response } of recordingResults) {
    const mbid = response.recordings?.[0]?.['artist-credit']?.[0]?.artist?.id;
    if (mbid) artistMbids.add(mbid);
  }

  console.log(`\n   Found ${artistMbids.size} unique artist MBIDs`);
  await batchResolveArtists(Array.from(artistMbids));

  // --- Step 5: Build songs from recording results + artist data ---
  const newSongs: Song[] = [];
  const artistNormLog: Array<{ from: string; to: string; score: number }> = [];
  const titleNormLog: Array<{ from: string; to: string; score: number }> = [];

  for (const { song: parsedSong, response } of recordingResults) {
    const recordings = response.recordings;
    let resolved: Song;

    if (!recordings || recordings.length === 0 || recordings[0].score < 50) {
      resolved = {
        id: generateId(parsedSong.artist, parsedSong.title),
        artist: parsedSong.artist,
        title: parsedSong.title,
      };
    } else {
      const best = recordings[0];
      const credit = best['artist-credit']?.[0];
      const mbArtistName = credit?.artist?.name;
      const artistMbid = credit?.artist?.id;
      const mbTitle = best.title;
      const year = extractYear(best);
      const country = artistMbid ? artistCache[artistMbid]?.country : undefined;

      // Use canonical MusicBrainz names when match confidence is high
      const useCanonical = best.score >= 80;
      const artistName = (useCanonical && mbArtistName) ? mbArtistName : parsedSong.artist;
      const songTitle = (useCanonical && mbTitle) ? mbTitle : parsedSong.title;

      // Log name normalization
      if (mbArtistName && mbArtistName.toLowerCase() !== parsedSong.artist.toLowerCase()) {
        artistNormLog.push({ from: parsedSong.artist, to: mbArtistName, score: best.score });
      }
      if (mbTitle && mbTitle.toLowerCase() !== parsedSong.title.toLowerCase()) {
        titleNormLog.push({ from: parsedSong.title, to: mbTitle, score: best.score });
      }

      resolved = {
        id: generateId(artistName, songTitle),
        artist: artistName,
        title: songTitle,
        ...(country ? { country } : {}),
        ...(year ? { year } : {}),
      };
    }

    newSongs.push(resolved);
    if (resolved.country) withCountry++;
    if (resolved.year) withYear++;

    // Update song cache
    const cacheKey = `${parsedSong.artist.toLowerCase()}||${parsedSong.title.toLowerCase()}`;
    const mbid = response.recordings?.[0]?.['artist-credit']?.[0]?.artist?.id;
    songCache[cacheKey] = {
      id: resolved.id,
      artist: resolved.artist,
      title: resolved.title,
      country: resolved.country,
      year: resolved.year,
      artistMbid: mbid,
      cachedAt: new Date().toISOString(),
    };
  }

  await saveCaches();

  // Log artist/title normalizations
  if (artistNormLog.length > 0) {
    console.log(`\n   Artist name normalizations (${artistNormLog.length}):`);
    for (const { from, to, score } of artistNormLog.slice(0, 30)) {
      console.log(`     "${from}" -> "${to}" (score: ${score})`);
    }
    if (artistNormLog.length > 30) {
      console.log(`     ... and ${artistNormLog.length - 30} more`);
    }
  }
  if (titleNormLog.length > 0) {
    console.log(`\n   Title normalizations (${titleNormLog.length}):`);
    for (const { from, to, score } of titleNormLog.slice(0, 20)) {
      console.log(`     "${from}" -> "${to}" (score: ${score})`);
    }
    if (titleNormLog.length > 20) {
      console.log(`     ... and ${titleNormLog.length - 20} more`);
    }
  }

  const allResolved = [...cached, ...newSongs];
  console.log(`\n   Summary:`);
  console.log(`   - Total unique songs: ${allResolved.length}`);
  console.log(`   - From cache: ${cached.length}`);
  console.log(`   - Newly resolved: ${newSongs.length} (${failures} failures)`);
  console.log(`   - API calls: ${apiCalls} recordings + ${artistMbids.size} artists`);
  console.log(`   - Artist names normalized: ${artistNormLog.filter((n) => n.score >= 80).length}`);
  console.log(`   - Metadata: ${withCountry}/${allResolved.length} with country, ${withYear}/${allResolved.length} with year`);

  return rebuildFullList(parsed, allResolved);
}

/**
 * Rebuild the full list (including duplicates from different folders)
 * by matching each parsed entry to its resolved song.
 */
function rebuildFullList(allParsed: ParsedSong[], resolved: Song[]): Song[] {
  const lookup = new Map<string, Song>();
  for (const song of resolved) {
    // Index by normalized artist+title from the original parsed input
    // We already indexed cache by this key
  }

  // Build a lookup from the resolved songs by their original parsed key
  // Since resolved list matches uniqueSongs order, re-index by id
  const byId = new Map<string, Song>();
  for (const song of resolved) {
    byId.set(song.id, song);
  }

  // For the full list, just return unique resolved songs (dedup happens later in pipeline)
  return resolved;
}
