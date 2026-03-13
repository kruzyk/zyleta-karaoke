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
 *   7. Generate detailed pipeline report
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFilenames, type ParsedSong } from './filename-parser.js';
import { resolveSongs, type Song } from './musicbrainz.js';
import { deduplicateSongs, loadOverrides, applyManualOverrides } from './dedup.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const RAW_FILELIST_PATH = path.join(ROOT, 'data', 'raw-filelist.json');
const OVERRIDES_PATH = path.join(ROOT, 'data', 'manual-overrides.json');
const OUTPUT_PATH = path.join(ROOT, 'src', 'data', 'songs.json');
// Reports directory: configurable via env var for CI (e.g. /tmp/pipeline-reports),
// falls back to data/reports/ for local development.
const REPORTS_DIR = process.env.REPORTS_DIR
  ? path.resolve(process.env.REPORTS_DIR)
  : path.join(ROOT, 'data', 'reports');

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

/**
 * Detailed tracking of what happened to each raw file through the pipeline.
 */
interface FileTracking {
  rawFilename: string;
  rawPath: string;
  status: 'parsed' | 'parse-failed' | 'duplicate-removed' | 'musicbrainz-failed' | 'final';
  artist?: string;
  title?: string;
  musicbrainzScore?: number;
  notes: string[];
}

/**
 * Summary report of the entire pipeline.
 */
interface PipelineReport {
  generatedAt: string;
  totalRawFiles: number;
  totalParsed: number;
  parseFailures: string[];
  parseFailureCount: number;
  duplicatesRemoved: Array<{
    normalizedKey: string;
    files: string[];
    keptId: string;
  }>;
  duplicateRemovedCount: number;
  musicBrainzFailures: Array<{
    artist: string;
    title: string;
    reason: string;
  }>;
  musicBrainzFailureCount: number;
  missingMetadata: {
    country: Array<{ artist: string; title: string }>;
    countryCount: number;
    year: Array<{ artist: string; title: string }>;
    yearCount: number;
  };
  finalCount: number;
  summaryStats: {
    rawToFinal: number;
    percentRetained: number;
    parseSuccessRate: number;
  };
}

async function main() {
  const forceRefresh = process.argv.includes('--force');

  console.log('🎤 Zyleta Karaoke - Processing song list');
  if (forceRefresh) {
    console.log('   *** FORCE REFRESH MODE - cache will be ignored ***');
  }
  console.log('');

  // Initialize report tracking
  const report: PipelineReport = {
    generatedAt: new Date().toISOString(),
    totalRawFiles: 0,
    totalParsed: 0,
    parseFailures: [],
    parseFailureCount: 0,
    duplicatesRemoved: [],
    duplicateRemovedCount: 0,
    musicBrainzFailures: [],
    musicBrainzFailureCount: 0,
    missingMetadata: {
      country: [],
      countryCount: 0,
      year: [],
      yearCount: 0,
    },
    finalCount: 0,
    summaryStats: {
      rawToFinal: 0,
      percentRetained: 0,
      parseSuccessRate: 0,
    },
  };

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
  report.totalRawFiles = raw.totalFiles;

  // 2. Parse filenames
  console.log('\n2. Parsing filenames...');
  const filePaths = raw.files.map((f) => f.relativePath);
  const parsed = parseFilenames(filePaths);
  const withArtist = parsed.filter((p) => p.artist.length > 0);
  const noArtist = parsed.filter((p) => p.artist.length === 0);
  console.log(`   Parsed: ${withArtist.length} with artist, ${noArtist.length} without`);
  report.totalParsed = withArtist.length;
  report.parseFailureCount = noArtist.length;

  if (noArtist.length > 0) {
    console.log('   Files without detected artist (check naming convention):');
    noArtist.slice(0, 10).forEach((p) => {
      console.log(`     - ${p.filename}`);
      report.parseFailures.push(p.filename);
    });
    if (noArtist.length > 10) {
      console.log(`     ... and ${noArtist.length - 10} more`);
      // Track all failures in report
      for (let i = 10; i < noArtist.length; i++) {
        report.parseFailures.push(noArtist[i].filename);
      }
    }
  }

  // 3. Resolve via MusicBrainz (if enabled)
  const useMusicBrainz = process.env.MUSICBRAINZ_ENABLED === 'true';
  let songs: Song[];

  if (useMusicBrainz) {
    console.log('\n3. Resolving via MusicBrainz API...');
    songs = await resolveSongs(withArtist, { forceRefresh });
  } else {
    console.log('\n3. Skipping MusicBrainz (MUSICBRAINZ_ENABLED not set)');
    songs = withArtist.map((p) => ({
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

  // Track songs before dedup for duplicate analysis
  const beforeDedup = songs;

  // 5. Deduplicate
  console.log('\n5. Deduplicating...');
  const dedupInfo = deduplicateSongsWithTracking(songs);
  songs = dedupInfo.songs;
  report.duplicatesRemoved = dedupInfo.duplicateGroups;
  report.duplicateRemovedCount = dedupInfo.totalRemoved;
  console.log(`   ${beforeDedup.length} -> ${songs.length} songs (${report.duplicateRemovedCount} duplicates removed)`);

  // 6. Analyze missing metadata
  console.log('\n6. Analyzing metadata coverage...');
  for (const song of songs) {
    if (!song.country) {
      if (report.missingMetadata.country.length < 100) {
        report.missingMetadata.country.push({ artist: song.artist, title: song.title });
      }
      report.missingMetadata.countryCount++;
    }
    if (!song.year) {
      if (report.missingMetadata.year.length < 100) {
        report.missingMetadata.year.push({ artist: song.artist, title: song.title });
      }
      report.missingMetadata.yearCount++;
    }
  }

  // 7. Data quality report
  console.log('\n7. Data quality report...');
  const qualityReport = validateSongs(songs);
  if (qualityReport.length > 0) {
    for (const line of qualityReport) {
      console.log(`   ${line}`);
    }
  } else {
    console.log('   All checks passed!');
  }

  // 8. Write songs.json
  console.log('\n8. Writing songs.json...');
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(songs, null, 2), 'utf-8');
  console.log(`   Written ${songs.length} songs to ${OUTPUT_PATH}`);
  report.finalCount = songs.length;

  // Calculate summary stats
  report.summaryStats.rawToFinal = songs.length;
  report.summaryStats.percentRetained = Math.round((songs.length / raw.totalFiles) * 100);
  report.summaryStats.parseSuccessRate = Math.round((report.totalParsed / raw.totalFiles) * 100);

  // 9. Generate and save report
  console.log('\n9. Generating pipeline report...');
  const reportPath = await savePipelineReport(report);
  console.log(`   Report saved to ${reportPath}`);

  console.log('\nDone!\n');
}

function validateSongs(songs: Song[]): string[] {
  const report: string[] = [];

  // Check for empty artists
  const noArtist = songs.filter((s) => !s.artist);
  if (noArtist.length > 0) {
    report.push(`WARNING: ${noArtist.length} songs have no artist:`);
    noArtist.slice(0, 10).forEach((s) => report.push(`  - "${s.title}"`));
    if (noArtist.length > 10) report.push(`  ... and ${noArtist.length - 10} more`);
  }

  // Check for duplicate artist names (case/punctuation variants)
  const artistVariants = new Map<string, Set<string>>();
  for (const s of songs) {
    if (!s.artist) continue;
    const normalized = s.artist.toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    if (!artistVariants.has(normalized)) artistVariants.set(normalized, new Set());
    artistVariants.get(normalized)!.add(s.artist);
  }
  const inconsistent = Array.from(artistVariants.entries())
    .filter(([, variants]) => variants.size > 1);
  if (inconsistent.length > 0) {
    report.push(`WARNING: ${inconsistent.length} artists have inconsistent naming:`);
    inconsistent.slice(0, 15).forEach(([, variants]) => {
      report.push(`  - ${Array.from(variants).map((v) => `"${v}"`).join(' vs ')}`);
    });
    if (inconsistent.length > 15) report.push(`  ... and ${inconsistent.length - 15} more`);
  }

  // Metadata coverage
  const noCountry = songs.filter((s) => !s.country).length;
  const noYear = songs.filter((s) => !s.year).length;
  const countryPct = Math.round(((songs.length - noCountry) / songs.length) * 100);
  const yearPct = Math.round(((songs.length - noYear) / songs.length) * 100);
  report.push(`Metadata coverage: country ${countryPct}%, year ${yearPct}%`);
  report.push(`Total: ${songs.length} songs`);

  return report;
}

function generateId(artist: string, title: string): string {
  return `${artist}-${title}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Normalize a string for deduplication comparison (same as dedup.ts).
 */
function normalizeForDedup(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deduplicate songs and track which ones were removed.
 */
function deduplicateSongsWithTracking(songs: Song[]): {
  songs: Song[];
  duplicateGroups: Array<{ normalizedKey: string; files: string[]; keptId: string }>;
  totalRemoved: number;
} {
  const seen = new Map<string, { song: Song; count: number }>();
  const duplicateGroups: Array<{ normalizedKey: string; files: string[]; keptId: string }> = [];

  for (const song of songs) {
    const key = `${normalizeForDedup(song.artist)}||${normalizeForDedup(song.title)}`;
    if (!seen.has(key)) {
      seen.set(key, { song, count: 1 });
    } else {
      const existing = seen.get(key)!;
      existing.count++;
      // Prefer the entry with more metadata
      const existingScore = (existing.song.country ? 1 : 0) + (existing.song.year ? 1 : 0);
      const newScore = (song.country ? 1 : 0) + (song.year ? 1 : 0);
      if (newScore > existingScore) {
        seen.set(key, { song, count: existing.count });
      }
    }
  }

  // Build duplicate groups report
  for (const [key, { count }] of seen) {
    if (count > 1) {
      const group = songs
        .filter((s) => `${normalizeForDedup(s.artist)}||${normalizeForDedup(s.title)}` === key)
        .map((s) => `${s.artist} - ${s.title}`)
        .slice(0, 5);
      duplicateGroups.push({
        normalizedKey: key,
        files: group,
        keptId: seen.get(key)!.song.id,
      });
    }
  }

  const uniqueSongs = Array.from(seen.values())
    .map((v) => v.song)
    .sort((a, b) => a.artist.localeCompare(b.artist, 'pl', { sensitivity: 'base' }));

  return {
    songs: uniqueSongs,
    duplicateGroups,
    totalRemoved: songs.length - uniqueSongs.length,
  };
}

/**
 * Save the pipeline report as a markdown file.
 */
async function savePipelineReport(report: PipelineReport): Promise<string> {
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  const date = new Date();
  const dateStr = date.toISOString().split('T')[0];
  const reportPath = path.join(REPORTS_DIR, `${dateStr}_pipeline-report.md`);

  let markdown = '# Żyleta Karaoke - Pipeline Report\n\n';
  markdown += `Generated: ${date.toISOString()}\n\n`;

  // Summary stats
  markdown += '## Summary\n\n';
  markdown += '| Metric | Value |\n';
  markdown += '|--------|-------|\n';
  markdown += `| Total raw files | ${report.totalRawFiles} |\n`;
  markdown += `| Successfully parsed | ${report.totalParsed} (${report.summaryStats.parseSuccessRate}%) |\n`;
  markdown += `| Parse failures | ${report.parseFailureCount} |\n`;
  markdown += `| Duplicates removed | ${report.duplicateRemovedCount} |\n`;
  markdown += `| MusicBrainz failures | ${report.musicBrainzFailureCount} |\n`;
  markdown += `| Songs without country | ${report.missingMetadata.countryCount} |\n`;
  markdown += `| Songs without year | ${report.missingMetadata.yearCount} |\n`;
  markdown += `| Final song count | ${report.finalCount} |\n`;
  markdown += `| Retention rate | ${report.summaryStats.percentRetained}% |\n`;
  markdown += '\n';

  // Parse failures
  if (report.parseFailures.length > 0) {
    markdown += `## Parse Failures (${report.parseFailureCount})\n\n`;
    markdown += 'Files where artist/title could not be extracted:\n\n';
    for (const file of report.parseFailures.slice(0, 50)) {
      markdown += `- \`${file}\`\n`;
    }
    if (report.parseFailures.length > 50) {
      markdown += `\n... and ${report.parseFailures.length - 50} more\n`;
    }
    markdown += '\n';
  }

  // Duplicates removed
  if (report.duplicatesRemoved.length > 0) {
    markdown += `## Duplicates Removed (${report.duplicateRemovedCount})\n\n`;
    markdown += 'Songs that appear multiple times with slight variations:\n\n';
    for (const dup of report.duplicatesRemoved.slice(0, 30)) {
      markdown += `### ${dup.normalizedKey}\n`;
      markdown += `Kept: \`${dup.keptId}\`\n\n`;
      markdown += 'Variants:\n';
      for (const variant of dup.files) {
        markdown += `- ${variant}\n`;
      }
      markdown += '\n';
    }
    if (report.duplicatesRemoved.length > 30) {
      markdown += `*... and ${report.duplicatesRemoved.length - 30} more duplicate groups*\n\n`;
    }
  }

  // Missing metadata
  markdown += `## Metadata Coverage\n\n`;
  markdown += `### Missing Country (${report.missingMetadata.countryCount})\n`;
  markdown += `${Math.round(((report.finalCount - report.missingMetadata.countryCount) / report.finalCount) * 100)}% of songs have country metadata.\n\n`;
  markdown += 'Sample of songs without country:\n\n';
  for (const song of report.missingMetadata.country.slice(0, 30)) {
    markdown += `- ${song.artist} - ${song.title}\n`;
  }
  if (report.missingMetadata.country.length > 30) {
    markdown += `\n*... and ${report.missingMetadata.country.length - 30} more*\n`;
  }
  markdown += '\n';

  markdown += `### Missing Year (${report.missingMetadata.yearCount})\n`;
  markdown += `${Math.round(((report.finalCount - report.missingMetadata.yearCount) / report.finalCount) * 100)}% of songs have year metadata.\n\n`;
  markdown += 'Sample of songs without year:\n\n';
  for (const song of report.missingMetadata.year.slice(0, 30)) {
    markdown += `- ${song.artist} - ${song.title}\n`;
  }
  if (report.missingMetadata.year.length > 30) {
    markdown += `\n*... and ${report.missingMetadata.year.length - 30} more*\n`;
  }
  markdown += '\n';

  await fs.writeFile(reportPath, markdown, 'utf-8');

  // In CI, also write to GITHUB_STEP_SUMMARY for inline visibility
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    await fs.appendFile(summaryPath, markdown, 'utf-8');
    console.log('   Report written to GitHub Step Summary');
  }

  return reportPath;
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
