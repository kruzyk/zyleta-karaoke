/**
 * Process raw file list (uploaded from karaoke laptop) into songs.json.
 *
 * This script is run by GitHub Actions when data/raw-filelist.json is updated.
 *
 * Usage:
 *   npx tsx scripts/process-filelist.ts           # Incremental (enrich new songs only)
 *   npx tsx scripts/process-filelist.ts --force    # Force re-enrich ALL songs
 *
 * Pipeline:
 *   1. READ   → Load data/raw-filelist.json
 *   2. PARSE  → Parse filenames → artist/title
 *   3. DIFF   → Compare with existing songs.json → find new songs (--force skips this)
 *   4. ENRICH → Send new songs to AI in batches → get canonical data + metadata
 *   5. MERGE  → Combine existing + new, deduplicate, apply manual overrides, write songs.json
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFilenames } from './filename-parser.js';
import { loadOverrides, applyManualOverrides } from './dedup.js';
import { enrichWithAi } from './ai-enricher.js';
import type { AiEnrichmentStats } from './ai-enricher.js';
import type { SongCountry } from '../src/types/song.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const RAW_FILELIST_PATH = path.join(ROOT, 'data', 'raw-filelist.json');
const OVERRIDES_PATH = path.join(ROOT, 'data', 'manual-overrides.json');
const OUTPUT_PATH = path.join(ROOT, 'src', 'data', 'songs.json');
const REPORTS_DIR = process.env.REPORTS_DIR
  ? path.resolve(process.env.REPORTS_DIR)
  : path.join(ROOT, '..', 'pipeline-reports');

interface Song {
  id: string;
  artist: string;
  title: string;
  country?: SongCountry;
  language?: SongCountry;
  year?: number;
}

interface RawFileEntry {
  filename: string;
  sourceFolder?: string;
}

interface RawFileList {
  scannedAt: string;
  folderPaths: string[];
  totalFiles: number;
  files: RawFileEntry[];
}

interface ProblematicSong {
  artist: string;
  title: string;
  issues: string[];
}

interface PipelineReport {
  generatedAt: string;
  totalRawFiles: number;
  totalParsed: number;
  titleOnlyFiles: string[];
  titleOnlyCount: number;
  duplicatesRemoved: Array<{
    normalizedKey: string;
    files: string[];
    keptId: string;
  }>;
  duplicateRemovedCount: number;
  aiStats: AiEnrichmentStats;
  missingMetadata: {
    country: Array<{ artist: string; title: string }>;
    countryCount: number;
    year: Array<{ artist: string; title: string }>;
    yearCount: number;
    language: Array<{ artist: string; title: string }>;
    languageCount: number;
  };
  problematicSongs: ProblematicSong[];
  inconsistentArtists: Array<{ normalized: string; variants: string[] }>;
  finalCount: number;
  summaryStats: {
    rawToFinal: number;
    percentRetained: number;
    parseSuccessRate: number;
  };
}

async function main() {
  const forceRefresh = process.argv.includes('--force');

  console.log('🎤 Żyleta Karaoke — Processing song list (AI enrichment)');
  if (forceRefresh) {
    console.log('   *** FORCE MODE — re-enriching ALL songs ***');
  }
  console.log('');

  const report: PipelineReport = {
    generatedAt: new Date().toISOString(),
    totalRawFiles: 0,
    totalParsed: 0,
    titleOnlyFiles: [],
    titleOnlyCount: 0,
    duplicatesRemoved: [],
    duplicateRemovedCount: 0,
    aiStats: {
      totalBatches: 0,
      enrichedCount: 0,
      skippedCount: 0,
      failedBatches: 0,
      provider: '',
      nullYearCount: 0,
      nullCountryCount: 0,
      nullLanguageCount: 0,
    },
    missingMetadata: {
      country: [],
      countryCount: 0,
      year: [],
      yearCount: 0,
      language: [],
      languageCount: 0,
    },
    problematicSongs: [],
    inconsistentArtists: [],
    finalCount: 0,
    summaryStats: {
      rawToFinal: 0,
      percentRetained: 0,
      parseSuccessRate: 0,
    },
  };

  // ── Stage 1: READ ──
  console.log('1. Reading raw file list...');
  let raw: RawFileList;
  try {
    const data = await fs.readFile(RAW_FILELIST_PATH, 'utf-8');
    raw = JSON.parse(data);
  } catch {
    console.error(`   Could not read ${RAW_FILELIST_PATH}`);
    process.exit(1);
  }
  console.log(
    `   Found ${raw.totalFiles} files from ${raw.folderPaths.length} folder(s) (scanned at ${raw.scannedAt})`,
  );
  report.totalRawFiles = raw.totalFiles;

  // ── Stage 2: PARSE ──
  console.log('\n2. Parsing filenames...');
  const filenames = raw.files.map((f) => f.filename);
  const parsed = parseFilenames(filenames);
  const withArtist = parsed.filter((p) => p.artist.length > 0);
  const noArtist = parsed.filter((p) => p.artist.length === 0);
  console.log(`   Parsed: ${withArtist.length} with artist, ${noArtist.length} title-only`);
  report.totalParsed = withArtist.length;
  report.titleOnlyCount = noArtist.length;

  if (noArtist.length > 0) {
    console.log('   Title-only files (AI will identify artist):');
    for (const p of noArtist) {
      console.log(`     - ${p.filename}`);
      report.titleOnlyFiles.push(p.filename);
    }
  }

  // ── Stage 3: DIFF ──
  console.log('\n3. Diffing against existing songs.json...');
  let existingSongs: Song[] = [];

  if (!forceRefresh) {
    try {
      const existingData = await fs.readFile(OUTPUT_PATH, 'utf-8');
      existingSongs = JSON.parse(existingData);
      console.log(`   Existing songs.json: ${existingSongs.length} songs`);
    } catch {
      console.log('   No existing songs.json found — processing all songs');
    }
  } else {
    console.log('   Force mode — processing all songs');
  }

  // Build lookup map from existing songs
  const existingMap = new Map<string, Song>();
  for (const song of existingSongs) {
    const key = `${normalizeForDedup(song.artist)}||${normalizeForDedup(song.title)}`;
    existingMap.set(key, song);
  }

  // Combine both: songs with artist + title-only songs (AI will identify artist)
  const allParsed = [...withArtist, ...noArtist];

  // Find songs not yet in existing data
  const newSongs = allParsed.filter((p) => {
    const key = `${normalizeForDedup(p.artist)}||${normalizeForDedup(p.title)}`;
    return !existingMap.has(key);
  });

  const songsToEnrich = forceRefresh ? allParsed : newSongs;
  console.log(
    forceRefresh
      ? `   Force mode: enriching all ${songsToEnrich.length} songs`
      : `   New songs to enrich: ${newSongs.length} (${existingSongs.length} already in songs.json)`,
  );

  // ── Stage 4: ENRICH ──
  console.log('\n4. AI enrichment...');
  let enrichedSongs: Song[] = [];

  if (songsToEnrich.length > 0) {
    const { results, stats } = await enrichWithAi(
      songsToEnrich.map((p) => ({ artist: p.artist, title: p.title })),
    );
    report.aiStats = stats;

    enrichedSongs = results.map((r) => ({
      id: generateId(r.artist, r.title),
      artist: r.artist,
      title: r.title,
      ...(r.country ? { country: r.country } : {}),
      ...(r.language ? { language: r.language } : {}),
      ...(r.year ? { year: r.year } : {}),
    }));

    console.log(`   Enriched: ${stats.enrichedCount} songs`);
    if (stats.failedBatches > 0) {
      console.log(`   Failed batches: ${stats.failedBatches}`);
    }
  } else {
    console.log('   No new songs to enrich');
  }

  // ── Stage 5: MERGE ──
  console.log('\n5. Merging, deduplicating, and applying overrides...');

  // Merge: existing + enriched (in force mode, only enriched)
  let allSongs: Song[];
  if (forceRefresh) {
    allSongs = enrichedSongs;
  } else {
    allSongs = [...existingSongs, ...enrichedSongs];
  }

  // Deduplicate (prefer entries with more metadata)
  const dedupResult = deduplicateSongsWithTracking(allSongs);
  let songs = dedupResult.songs;
  report.duplicatesRemoved = dedupResult.duplicateGroups;
  report.duplicateRemovedCount = dedupResult.totalRemoved;
  console.log(
    `   ${allSongs.length} → ${songs.length} songs (${dedupResult.totalRemoved} duplicates removed)`,
  );

  // Apply manual overrides (overrides always win)
  const overrides = await loadOverrides(OVERRIDES_PATH);
  const overrideCount = Object.keys(overrides).length;
  songs = applyManualOverrides(songs, overrides);
  console.log(`   Applied ${overrideCount} manual overrides`);

  // Analyze metadata coverage
  for (const song of songs) {
    if (!song.country) {
      report.missingMetadata.country.push({ artist: song.artist, title: song.title });
      report.missingMetadata.countryCount++;
    }
    if (!song.year) {
      report.missingMetadata.year.push({ artist: song.artist, title: song.title });
      report.missingMetadata.yearCount++;
    }
    if (!song.language) {
      report.missingMetadata.language.push({ artist: song.artist, title: song.title });
      report.missingMetadata.languageCount++;
    }
  }

  // Detect problematic songs
  report.problematicSongs = findProblematicSongs(songs);
  if (report.problematicSongs.length > 0) {
    console.log(`   ⚠️ ${report.problematicSongs.length} problematic songs detected`);
  }

  // Find inconsistent artist naming
  report.inconsistentArtists = findInconsistentArtists(songs);
  if (report.inconsistentArtists.length > 0) {
    console.log(`   ⚠️ ${report.inconsistentArtists.length} artists with inconsistent naming`);
  }

  // Data quality report
  const qualityReport = validateSongs(songs);
  if (qualityReport.length > 0) {
    for (const line of qualityReport) console.log(`   ${line}`);
  }

  // Write songs.json
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(songs, null, 2), 'utf-8');
  console.log(`\n   Written ${songs.length} songs to ${OUTPUT_PATH}`);
  report.finalCount = songs.length;

  report.summaryStats.rawToFinal = songs.length;
  report.summaryStats.percentRetained = Math.round((songs.length / raw.totalFiles) * 100);
  report.summaryStats.parseSuccessRate = Math.round(
    (report.totalParsed / raw.totalFiles) * 100,
  );

  // Generate report
  const reportPath = await savePipelineReport(report);
  console.log(`   Report saved to ${reportPath}`);
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

function normalizeForDedup(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function deduplicateSongsWithTracking(songs: Song[]): {
  songs: Song[];
  duplicateGroups: Array<{ normalizedKey: string; files: string[]; keptId: string }>;
  totalRemoved: number;
} {
  const seen = new Map<string, { song: Song; count: number }>();
  for (const song of songs) {
    const key = `${normalizeForDedup(song.artist)}||${normalizeForDedup(song.title)}`;
    if (!seen.has(key)) {
      seen.set(key, { song, count: 1 });
    } else {
      const existing = seen.get(key)!;
      existing.count++;
      const existingScore = (existing.song.country ? 1 : 0) + (existing.song.language ? 1 : 0) + (existing.song.year ? 1 : 0);
      const newScore = (song.country ? 1 : 0) + (song.language ? 1 : 0) + (song.year ? 1 : 0);
      if (newScore > existingScore) {
        seen.set(key, { song, count: existing.count });
      }
    }
  }

  const duplicateGroups: Array<{ normalizedKey: string; files: string[]; keptId: string }> = [];
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

  return { songs: uniqueSongs, duplicateGroups, totalRemoved: songs.length - uniqueSongs.length };
}

function validateSongs(songs: Song[]): string[] {
  const lines: string[] = [];
  const noArtist = songs.filter((s) => !s.artist);
  if (noArtist.length > 0) {
    lines.push(`WARNING: ${noArtist.length} songs have no artist`);
  }

  const artistVariants = new Map<string, Set<string>>();
  for (const s of songs) {
    if (!s.artist) continue;
    const normalized = s.artist
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    if (!artistVariants.has(normalized)) artistVariants.set(normalized, new Set());
    artistVariants.get(normalized)!.add(s.artist);
  }
  const inconsistent = [...artistVariants.entries()].filter(([, v]) => v.size > 1);
  if (inconsistent.length > 0) {
    lines.push(`WARNING: ${inconsistent.length} artists have inconsistent naming`);
  }

  const noCountry = songs.filter((s) => !s.country).length;
  const noYear = songs.filter((s) => !s.year).length;
  const countryPct = Math.round(((songs.length - noCountry) / songs.length) * 100);
  const yearPct = Math.round(((songs.length - noYear) / songs.length) * 100);
  lines.push(`Metadata coverage: country ${countryPct}%, year ${yearPct}%`);
  lines.push(`Total: ${songs.length} songs`);

  return lines;
}

function findProblematicSongs(songs: Song[]): ProblematicSong[] {
  const problematic: ProblematicSong[] = [];

  for (const song of songs) {
    const issues: string[] = [];

    // No artist
    if (!song.artist) issues.push('Missing artist');

    // Trailing special characters (asterisks, quotes)
    if (/[*"']+$/.test(song.artist)) issues.push(`Trailing special chars in artist: "${song.artist}"`);
    if (/[*"']+$/.test(song.title)) issues.push(`Trailing special chars in title: "${song.title}"`);

    // Wrapping quotes in artist or title
    if (/^['""''].*['""'']$/.test(song.artist)) issues.push(`Wrapping quotes in artist: "${song.artist}"`);
    if (/^['""''].*['""'']$/.test(song.title)) issues.push(`Wrapping quotes in title: "${song.title}"`);

    // All metadata missing
    if (!song.country && !song.year && !song.language) {
      issues.push('No metadata (country, year, language all missing)');
    }

    // Suspicious short artist (1 character)
    if (song.artist.length === 1) issues.push(`Suspiciously short artist: "${song.artist}"`);

    // Artist looks like a filename (contains file extensions)
    if (/\.(mp3|mp4|avi|mkv|cdg|kfn|mid|kar)/i.test(song.artist)) {
      issues.push(`Artist looks like a filename: "${song.artist}"`);
    }
    if (/\.(mp3|mp4|avi|mkv|cdg|kfn|mid|kar)/i.test(song.title)) {
      issues.push(`Title looks like a filename: "${song.title}"`);
    }

    if (issues.length > 0) {
      problematic.push({ artist: song.artist, title: song.title, issues });
    }
  }

  return problematic;
}

function findInconsistentArtists(songs: Song[]): Array<{ normalized: string; variants: string[] }> {
  const artistVariants = new Map<string, Set<string>>();
  for (const s of songs) {
    if (!s.artist) continue;
    const normalized = s.artist
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    if (!artistVariants.has(normalized)) artistVariants.set(normalized, new Set());
    artistVariants.get(normalized)!.add(s.artist);
  }

  return [...artistVariants.entries()]
    .filter(([, v]) => v.size > 1)
    .map(([normalized, variants]) => ({ normalized, variants: [...variants] }));
}

async function savePipelineReport(report: PipelineReport): Promise<string> {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const dateStr = new Date().toISOString().split('T')[0];
  const reportPath = path.join(REPORTS_DIR, `${dateStr}_pipeline-report.md`);

  let md = '# Żyleta Karaoke — Pipeline Report\n\n';
  md += `Generated: ${report.generatedAt}\n\n`;

  md += '## Summary\n\n';
  md += '| Metric | Value |\n|--------|-------|\n';
  md += `| Raw files | ${report.totalRawFiles} |\n`;
  md += `| Parsed (with artist) | ${report.totalParsed} (${report.summaryStats.parseSuccessRate}%) |\n`;
  md += `| Title-only (AI identified) | ${report.titleOnlyCount} |\n`;
  md += `| Duplicates removed | ${report.duplicateRemovedCount} |\n`;
  md += `| Final songs | ${report.finalCount} |\n\n`;

  md += '## AI Enrichment\n\n';
  md += '| Metric | Value |\n|--------|-------|\n';
  md += `| Provider | ${report.aiStats.provider} |\n`;
  md += `| Total batches | ${report.aiStats.totalBatches} |\n`;
  md += `| Songs enriched | ${report.aiStats.enrichedCount} |\n`;
  md += `| Songs skipped (already in songs.json) | ${report.aiStats.skippedCount} |\n`;
  md += `| Failed batches | ${report.aiStats.failedBatches} |\n\n`;

  md += '### Enrichment Quality\n\n';
  md += '| Field | Filled | Null | Coverage |\n|-------|--------|------|----------|\n';
  const enriched = report.aiStats.enrichedCount || 1;
  const yearFilled = enriched - report.aiStats.nullYearCount;
  const countryFilled = enriched - report.aiStats.nullCountryCount;
  const langFilled = enriched - report.aiStats.nullLanguageCount;
  md += `| Year | ${yearFilled} | ${report.aiStats.nullYearCount} | ${Math.round((yearFilled / enriched) * 100)}% |\n`;
  md += `| Country | ${countryFilled} | ${report.aiStats.nullCountryCount} | ${Math.round((countryFilled / enriched) * 100)}% |\n`;
  md += `| Language | ${langFilled} | ${report.aiStats.nullLanguageCount} | ${Math.round((langFilled / enriched) * 100)}% |\n\n`;

  md += '## Metadata Coverage (Final)\n\n';
  const countryPct = report.finalCount > 0
    ? Math.round(((report.finalCount - report.missingMetadata.countryCount) / report.finalCount) * 100)
    : 0;
  const yearPct = report.finalCount > 0
    ? Math.round(((report.finalCount - report.missingMetadata.yearCount) / report.finalCount) * 100)
    : 0;
  const langCovPct = report.finalCount > 0
    ? Math.round(((report.finalCount - report.missingMetadata.languageCount) / report.finalCount) * 100)
    : 0;
  md += '| Field | Coverage | Missing |\n|-------|----------|----------|\n';
  md += `| Country | ${countryPct}% | ${report.missingMetadata.countryCount} |\n`;
  md += `| Year | ${yearPct}% | ${report.missingMetadata.yearCount} |\n`;
  md += `| Language | ${langCovPct}% | ${report.missingMetadata.languageCount} |\n\n`;

  if (report.titleOnlyFiles.length > 0) {
    md += `## Title-Only Files (${report.titleOnlyCount})\n\n`;
    md += 'These files had no artist in the filename — AI identified the artist.\n\n';
    for (const file of report.titleOnlyFiles) md += `- \`${file}\`\n`;
    md += '\n';
  }

  if (report.duplicatesRemoved.length > 0) {
    md += `## Duplicates Removed (${report.duplicateRemovedCount})\n\n`;
    for (const dup of report.duplicatesRemoved) {
      md += `- **${dup.normalizedKey}** (kept: \`${dup.keptId}\`)\n`;
    }
    md += '\n';
  }

  if (report.problematicSongs.length > 0) {
    md += `## Problematic Songs (${report.problematicSongs.length})\n\n`;
    md += 'Songs with data quality issues that may need manual review.\n\n';
    md += '| Artist | Title | Issues |\n|--------|-------|--------|\n';
    for (const song of report.problematicSongs) {
      const escapedArtist = song.artist || '_(empty)_';
      const escapedIssues = song.issues.join('; ');
      md += `| ${escapedArtist} | ${song.title} | ${escapedIssues} |\n`;
    }
    md += '\n';
  }

  if (report.inconsistentArtists.length > 0) {
    md += `## Inconsistent Artist Names (${report.inconsistentArtists.length})\n\n`;
    md += 'Same artist with different spellings/capitalizations in the database.\n\n';
    for (const entry of report.inconsistentArtists) {
      md += `- ${entry.variants.map((v) => `\`${v}\``).join(' vs ')}\n`;
    }
    md += '\n';
  }

  // List songs missing all metadata (most severe cases, max 50)
  const noMetadata = report.problematicSongs.filter((s) =>
    s.issues.some((i) => i.includes('No metadata')),
  );
  if (noMetadata.length > 0) {
    md += `## Songs Missing All Metadata (${noMetadata.length})\n\n`;
    md += 'These songs have no country, year, or language — may need manual overrides.\n\n';
    for (const song of noMetadata) {
      md += `- ${song.artist || '_(no artist)_'} — ${song.title}\n`;
    }
    md += '\n';
  }

  await fs.writeFile(reportPath, md, 'utf-8');

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) {
    await fs.appendFile(summaryPath, md, 'utf-8');
  }

  return reportPath;
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
