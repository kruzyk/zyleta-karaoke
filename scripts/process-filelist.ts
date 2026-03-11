/**
 * Process raw file list (uploaded from karaoke laptop) into songs.json.
 *
 * This script is run by GitHub Actions when data/raw-filelist.json is updated.
 *
 * Usage:
 *   npx tsx scripts/process-filelist.ts           # Normal (uses cache)
 *   npx tsx scripts/process-filelist.ts --force    # Force re-fetch all from MusicBrainz
 *
 * Pipeline:
 *   1. Read data/raw-filelist.json (uploaded by scan-and-upload.ps1)
 *   2. Parse filenames -> artist/title
 *   3. (Optional) Resolve via MusicBrainz API
 *   4. Apply manual overrides
 *   5. Deduplicate
 *   6. Write src/data/songs.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFilenames } from './filename-parser.js';
import { resolveSongs, type Song } from './musicbrainz.js';
import { deduplicateSongs, loadOverrides, applyManualOverrides } from './dedup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const RAW_FILELIST_PATH = path.join(ROOT, 'data', 'raw-filelist.json');
const OVERRIDES_PATH = path.join(ROOT, 'data', 'manual-overrides.json');
const OUTPUT_PATH = path.join(ROOT, 'src', 'data', 'songs.json');

interface RawFileEntry {
  filename: string;
  relativePath: string;
  sourceFolder?: string;
  extension: string;
  sizeBytes: number;
}

interface RawFileList {
  scannedAt: string;
  folderPaths: string[];
  totalFiles: number;
  files: RawFileEntry[];
}

async function main() {
  const forceRefresh = process.argv.includes('--force');

  console.log('🎤 Zyleta Karaoke - Processing song list');
  if (forceRefresh) {
    console.log('   *** FORCE REFRESH MODE - cache will be ignored ***');
  }
  console.log('');

  // 1. Read raw file list
  console.log('1. Reading raw file list...');
  let raw: RawFileList;
  try {
    const data = await fs.readFile(RAW_FILELIST_PATH, 'utf-8');
    raw = JSON.parse(data);
  } catch {
    console.error(`   Could not read ${RAW_FILELIST_PATH}`);
    console.error('   Make sure data/raw-filelist.json exists.');
    process.exit(1);
  }
  console.log(`   Found ${raw.totalFiles} files from ${raw.folderPaths.length} folder(s) (scanned at ${raw.scannedAt})`);
  raw.folderPaths.forEach((f) => console.log(`     - ${f}`));

  // 2. Parse filenames
  console.log('\n2. Parsing filenames...');
  const filePaths = raw.files.map((f) => f.relativePath);
  const parsed = parseFilenames(filePaths);
  const withArtist = parsed.filter((p) => p.artist.length > 0);
  const noArtist = parsed.filter((p) => p.artist.length === 0);
  console.log(`   Parsed: ${withArtist.length} with artist, ${noArtist.length} without`);

  if (noArtist.length > 0) {
    console.log('   Files without detected artist (check naming convention):');
    noArtist.slice(0, 10).forEach((p) => console.log(`     - ${p.filename}`));
    if (noArtist.length > 10) console.log(`     ... and ${noArtist.length - 10} more`);
  }

  // 3. Resolve via MusicBrainz (if enabled)
  const useMusicBrainz = process.env.MUSICBRAINZ_ENABLED === 'true';
  let songs: Song[];

  if (useMusicBrainz) {
    console.log('\n3. Resolving via MusicBrainz API...');
    songs = await resolveSongs(parsed, { forceRefresh });
  } else {
    console.log('\n3. Skipping MusicBrainz (MUSICBRAINZ_ENABLED not set)');
    songs = parsed.map((p) => ({
      id: generateId(p.artist, p.title),
      artist: p.artist,
      title: p.title,
    }));
  }

  // 4. Apply manual overrides
  console.log('\n4. Applying manual overrides...');
  const overrides = await loadOverrides(OVERRIDES_PATH);
  const overrideCount = Object.keys(overrides).length;
  songs = applyManualOverrides(songs, overrides);
  console.log(`   Applied ${overrideCount} overrides`);

  // 5. Deduplicate
  console.log('\n5. Deduplicating...');
  const beforeDedup = songs.length;
  songs = deduplicateSongs(songs);
  const removed = beforeDedup - songs.length;
  console.log(`   ${beforeDedup} -> ${songs.length} songs (${removed} duplicates removed)`);

  // 6. Write songs.json
  console.log('\n6. Writing songs.json...');
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(songs, null, 2), 'utf-8');
  console.log(`   Written ${songs.length} songs to ${OUTPUT_PATH}`);

  console.log('\nDone!\n');
}

function generateId(artist: string, title: string): string {
  return `${artist}-${title}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
