/**
 * Process raw file list (uploaded from karaoke laptop) into songs.json.
 *
 * This script is run by GitHub Actions when data/raw-filelist.json is updated.
 *
 * Usage:
 *   npx tsx scripts/process-filelist.ts           # Normal (uses cache)
 *   npx tsx scripts/process-filelist.ts --force    # Force re-fetch all from APIs
 *
 * Pipeline:
 *   1. Read data/raw-filelist.json (uploaded by scan-and-upload.ps1)
 *   2. Parse filenames -> artist/title
 *   3. Resolve via multi-API orchestrator (MusicBrainz, Discogs, Last.fm)
 *   4. AI verification of flagged + discrepancy entries (optional)
 *   5. Apply manual overrides
 *   6. Deduplicate
 *   7. Write src/data/songs.json
 *   8. Generate pipeline report (summary + AI decisions + flagged entries)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFilenames, type ParsedSong } from './filename-parser.js';
import type { Song } from './musicbrainz.js';
import { loadOverrides, applyManualOverrides } from './dedup.js';
import { createOrchestrator, verifyWithAi } from './api-providers/index.js';
import type { ConsensusResult, ProviderHealth } from './api-providers/types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const RAW_FILELIST_PATH = path.join(ROOT, 'data', 'raw-filelist.json');
const OVERRIDES_PATH = path.join(ROOT, 'data', 'manual-overrides.json');
const OUTPUT_PATH = path.join(ROOT, 'src', 'data', 'songs.json');
// Reports directory: configurable via env var for CI (e.g. /tmp/pipeline-reports),
// defaults to a temp directory to avoid writing into the project.
const REPORTS_DIR = process.env.REPORTS_DIR
  ? path.resolve(process.env.REPORTS_DIR)
  : path.join(ROOT, '..', 'pipeline-reports');

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
  apiStats: {
    providers: string[];
    totalResolved: number;
    consensusMatches: number;
    singleMatches: number;
    noMatches: number;
    flaggedCount: number;
    discrepancyCount: number;
    aiVerifiedCount: number;
    aiAccepted: number;
    aiCorrected: number;
    aiRejected: number;
  };
  providerHealth: ProviderHealth[];
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
  flaggedEntries: ConsensusResult[];
  /** All entries that went through AI verification (flagged + discrepancies) */
  aiReviewedEntries: ConsensusResult[];
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
    apiStats: {
      providers: [],
      totalResolved: 0,
      consensusMatches: 0,
      singleMatches: 0,
      noMatches: 0,
      flaggedCount: 0,
      discrepancyCount: 0,
      aiVerifiedCount: 0,
      aiAccepted: 0,
      aiCorrected: 0,
      aiRejected: 0,
    },
    providerHealth: [],
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
    flaggedEntries: [],
    aiReviewedEntries: [],
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
    for (const p of noArtist) {
      console.log(`     - ${p.filename}`);
    }
    for (const p of noArtist) {
      report.parseFailures.push(p.filename);
    }
  }

  // 3. Resolve via multi-API orchestrator
  const useApis = process.env.MUSICBRAINZ_ENABLED === 'true';
  let songs: Song[];

  if (useApis) {
    console.log('\n3. Resolving via multi-API orchestrator...');
    const orchestrator = await createOrchestrator();
    report.apiStats.providers = orchestrator.getProviderHealth().map((h) => h.name);

    // Deduplicate input by artist+title before API calls (save API quota)
    const uniqueMap = new Map<string, ParsedSong>();
    for (const song of withArtist) {
      const key = `${song.artist.toLowerCase()}||${song.title.toLowerCase()}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, song);
      }
    }
    const uniqueSongs = Array.from(uniqueMap.values());
    console.log(`   Unique artist+title pairs: ${uniqueSongs.length} (from ${withArtist.length} files)`);

    const estimatedMinutes = Math.ceil(uniqueSongs.length * 1.2 / 60);
    console.log(`   Estimated time: ~${estimatedMinutes} min`);

    // Resolve each unique song through the orchestrator
    const consensusResults: ConsensusResult[] = [];
    for (let i = 0; i < uniqueSongs.length; i++) {
      const parsed = uniqueSongs[i];
      const result = await orchestrator.resolve(parsed.artist, parsed.title);

      // Attach original filename data for traceability
      result.originalInput = {
        artist: parsed.artist,
        title: parsed.title,
        filename: parsed.filename,
      };

      consensusResults.push(result);

      if ((i + 1) % 100 === 0 || i === uniqueSongs.length - 1) {
        const stats = orchestrator.getStats();
        console.log(`   Progress: ${i + 1}/${uniqueSongs.length} | consensus: ${stats.consensus} | single: ${stats.singleMatch} | no-match: ${stats.noMatch} | flagged: ${stats.flagged}`);
        await orchestrator.saveCaches();
      }
    }

    // Save caches
    await orchestrator.saveCaches();

    // Collect stats
    const stats = orchestrator.getStats();
    report.apiStats.totalResolved = stats.total;
    report.apiStats.consensusMatches = stats.consensus;
    report.apiStats.singleMatches = stats.singleMatch;
    report.apiStats.noMatches = stats.noMatch;
    report.apiStats.flaggedCount = stats.flagged;
    report.flaggedEntries = orchestrator.getFlaggedEntries();

    // Collect provider health
    const providerHealth = orchestrator.getProviderHealth();
    report.providerHealth = providerHealth;

    console.log(`\n   API Resolution Summary:`);
    console.log(`   - Consensus (multiple APIs agree): ${stats.consensus}`);
    console.log(`   - Single API match: ${stats.singleMatch}`);
    console.log(`   - No match: ${stats.noMatch}`);
    console.log(`   - Flagged for review: ${stats.flagged}`);

    // Log provider health
    console.log(`\n   Provider Health:`);
    for (const h of providerHealth) {
      const statusIcon = h.status === 'active' ? '✅' : '❌';
      const details = h.status === 'active'
        ? `${h.successCount}/${h.totalRequests} successful`
        : `DISABLED: ${h.reason || h.status}`;
      console.log(`   ${statusIcon} ${h.name}: ${details}`);
    }

    // Warn loudly if any provider had auth errors
    if (orchestrator.hasAuthErrors()) {
      console.error('\n   🚨 WARNING: One or more API providers had authentication errors!');
      console.error('   🚨 Check your API tokens/keys in GitHub Secrets.');
      console.error('   🚨 The pipeline continued with remaining providers.');
    }

    // Find discrepancy entries: API data differs from original filename data
    // (entries where consensus changed artist or title, but weren't flagged)
    const discrepancyEntries = consensusResults.filter((cr) => {
      if (cr.flagged) return false; // Already flagged, handled separately
      if (!cr.originalInput) return false;
      const origArtist = normalizeForComparison(cr.originalInput.artist);
      const origTitle = normalizeForComparison(cr.originalInput.title);
      const consArtist = normalizeForComparison(cr.artist);
      const consTitle = normalizeForComparison(cr.title);
      return origArtist !== consArtist || origTitle !== consTitle;
    });
    report.apiStats.discrepancyCount = discrepancyEntries.length;

    if (discrepancyEntries.length > 0) {
      console.log(`\n   Discrepancies (original != API result, not flagged): ${discrepancyEntries.length}`);
    }

    // 4. AI verification of flagged entries + discrepancies
    const entriesToVerify = [...report.flaggedEntries, ...discrepancyEntries];
    if (entriesToVerify.length > 0) {
      console.log(`\n4. AI verification of ${entriesToVerify.length} entries (${report.flaggedEntries.length} flagged + ${discrepancyEntries.length} discrepancies)...`);
      try {
        const aiResults = await verifyWithAi(entriesToVerify);
        report.apiStats.aiVerifiedCount = aiResults.filter((r) => !r.stillFlagged).length;

        // Count AI decisions
        report.apiStats.aiAccepted = aiResults.filter((r) => r.decision?.action === 'accepted').length;
        report.apiStats.aiCorrected = aiResults.filter((r) => r.decision?.action === 'corrected').length;
        report.apiStats.aiRejected = aiResults.filter((r) => r.decision?.action === 'rejected').length;

        // Apply AI decisions to consensus results
        if (aiResults.length > 0) {
          const aiMap = new Map(aiResults.map((r) => [
            `${r.originalArtist.toLowerCase()}||${r.originalTitle.toLowerCase()}`,
            r,
          ]));
          for (const cr of consensusResults) {
            const origArtist = cr.originalInput?.artist || cr.artist;
            const origTitle = cr.originalInput?.title || cr.title;
            const key = `${origArtist.toLowerCase()}||${origTitle.toLowerCase()}`;
            const aiResult = aiMap.get(key);
            if (aiResult) {
              // Store AI decision on the consensus result for reporting
              cr.aiDecision = aiResult.decision;

              // Apply the AI's chosen artist/title
              cr.artist = aiResult.verifiedArtist;
              cr.title = aiResult.verifiedTitle;
              if (!aiResult.stillFlagged) {
                cr.flagged = false;
                cr.flagReasons = [];
              }
            }
          }

          // Log AI decisions to console
          console.log(`\n   AI Decision Summary:`);
          console.log(`   - Accepted (API data correct): ${report.apiStats.aiAccepted}`);
          console.log(`   - Corrected (AI fixed data): ${report.apiStats.aiCorrected}`);
          console.log(`   - Rejected (kept original): ${report.apiStats.aiRejected}`);
          console.log(`   - Still needs manual review: ${aiResults.filter((r) => r.stillFlagged).length}`);

          // Log notable decisions (corrections and rejections)
          const notable = aiResults.filter((r) => r.decision?.action !== 'accepted');
          if (notable.length > 0) {
            console.log(`\n   Notable AI decisions:`);
            for (const r of notable.slice(0, 20)) {
              const icon = r.decision?.action === 'rejected' ? '🚫' : '✏️';
              console.log(`   ${icon} [${r.decision?.action}] "${r.originalArtist} — ${r.originalTitle}"`);
              console.log(`      → "${r.verifiedArtist} — ${r.verifiedTitle}" (${r.decision?.confidence})`);
              if (r.aiNotes) console.log(`      Reason: ${r.aiNotes}`);
            }
            if (notable.length > 20) {
              console.log(`   ... and ${notable.length - 20} more (see report)`);
            }
          }
        }

        // Collect entries that went through AI for reporting
        report.aiReviewedEntries = consensusResults.filter((cr) => cr.aiDecision !== undefined);
      } catch (error) {
        console.warn(`   ⚠️ AI verification failed: ${error instanceof Error ? error.message : error}`);
        console.warn('   Entries kept as-is. Pipeline continues.');
      }
    } else {
      console.log('\n4. No entries need AI verification');
    }

    // Update flagged entries (some may have been resolved by AI)
    report.flaggedEntries = consensusResults.filter((cr) => cr.flagged);

    // Convert ConsensusResult[] to Song[]
    songs = consensusResults.map((cr) => ({
      id: generateId(cr.artist, cr.title),
      artist: cr.artist,
      title: cr.title,
      ...(cr.country ? { country: cr.country } : {}),
      ...(cr.year ? { year: cr.year } : {}),
    }));
  } else {
    console.log('\n3. Skipping API resolution (MUSICBRAINZ_ENABLED not set)');
    console.log('\n4. Skipping AI verification');
    songs = withArtist.map((p) => ({
      id: generateId(p.artist, p.title),
      artist: p.artist,
      title: p.title,
    }));
  }

  // 5. Apply manual overrides
  console.log('\n5. Applying manual overrides...');
  const overrides = await loadOverrides(OVERRIDES_PATH);
  const overrideCount = Object.keys(overrides).length;
  songs = applyManualOverrides(songs, overrides);
  console.log(`   Applied ${overrideCount} overrides`);

  // Track songs before dedup for duplicate analysis
  const beforeDedup = songs;

  // 6. Deduplicate
  console.log('\n6. Deduplicating...');
  const dedupInfo = deduplicateSongsWithTracking(songs);
  songs = dedupInfo.songs;
  report.duplicatesRemoved = dedupInfo.duplicateGroups;
  report.duplicateRemovedCount = dedupInfo.totalRemoved;
  console.log(`   ${beforeDedup.length} -> ${songs.length} songs (${report.duplicateRemovedCount} duplicates removed)`);

  // 7. Analyze missing metadata
  console.log('\n7. Analyzing metadata coverage...');
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

  // Data quality report
  console.log('\n   Data quality checks...');
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

/**
 * Normalize a string for comparison (remove accents, lowercase, strip punctuation).
 */
function normalizeForComparison(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function validateSongs(songs: Song[]): string[] {
  const lines: string[] = [];

  // Check for empty artists
  const noArtist = songs.filter((s) => !s.artist);
  if (noArtist.length > 0) {
    lines.push(`WARNING: ${noArtist.length} songs have no artist:`);
    noArtist.slice(0, 10).forEach((s) => lines.push(`  - "${s.title}"`));
    if (noArtist.length > 10) lines.push(`  ... and ${noArtist.length - 10} more`);
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
    lines.push(`WARNING: ${inconsistent.length} artists have inconsistent naming:`);
    inconsistent.slice(0, 15).forEach(([, variants]) => {
      lines.push(`  - ${Array.from(variants).map((v) => `"${v}"`).join(' vs ')}`);
    });
    if (inconsistent.length > 15) lines.push(`  ... and ${inconsistent.length - 15} more`);
  }

  // Metadata coverage
  const noCountry = songs.filter((s) => !s.country).length;
  const noYear = songs.filter((s) => !s.year).length;
  const countryPct = Math.round(((songs.length - noCountry) / songs.length) * 100);
  const yearPct = Math.round(((songs.length - noYear) / songs.length) * 100);
  lines.push(`Metadata coverage: country ${countryPct}%, year ${yearPct}%`);
  lines.push(`Total: ${songs.length} songs`);

  return lines;
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
 * Get a safe display label for a ConsensusResult entry.
 * Returns the original filename if available, otherwise "artist — title".
 */
function getEntryLabel(entry: ConsensusResult): string {
  if (entry.originalInput?.filename) return entry.originalInput.filename;
  const artist = entry.originalInput?.artist || entry.artist || 'unknown';
  const title = entry.originalInput?.title || entry.title || 'unknown';
  return `${artist} — ${title}`;
}

/**
 * Save the pipeline report as a markdown file.
 * Report includes: summary, API stats, AI decisions, flagged entries, metadata coverage.
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
  markdown += `| Final song count | ${report.finalCount} |\n`;
  markdown += `| Retention rate | ${report.summaryStats.percentRetained}% |\n`;
  markdown += '\n';

  // Provider Health — always show, critical for token monitoring
  if (report.providerHealth.length > 0) {
    const hasProblems = report.providerHealth.some((h) => h.status !== 'active');
    markdown += hasProblems
      ? '## ⚠️ Provider Health\n\n'
      : '## Provider Health\n\n';
    markdown += '| Provider | Status | Requests | Success | Errors | Details |\n';
    markdown += '|----------|--------|----------|---------|--------|---------|\n';
    for (const h of report.providerHealth) {
      const statusEmoji = h.status === 'active' ? '✅' : h.status === 'disabled-auth' ? '🔑❌' : '❌';
      const details = h.reason || (h.status === 'active' ? 'OK' : h.status);
      markdown += `| ${h.name} | ${statusEmoji} ${h.status} | ${h.totalRequests} | ${h.successCount} | ${h.errorCount} | ${details} |\n`;
    }
    markdown += '\n';

    // Big warning for auth errors
    const authFailed = report.providerHealth.filter((h) => h.status === 'disabled-auth');
    if (authFailed.length > 0) {
      markdown += '> **🚨 CRITICAL: API token/key error detected!**\n>\n';
      for (const h of authFailed) {
        markdown += `> **${h.name}**: ${h.reason}\n>\n`;
      }
      markdown += '> Check your GitHub Secrets and regenerate expired tokens.\n>\n';
      markdown += '> The pipeline continued with remaining providers, but data quality may be reduced.\n\n';
    }
  }

  // API resolution stats
  if (report.apiStats.totalResolved > 0) {
    markdown += '## API Resolution\n\n';
    markdown += '| Metric | Value |\n';
    markdown += '|--------|-------|\n';
    markdown += `| Total resolved | ${report.apiStats.totalResolved} |\n`;
    markdown += `| Consensus (multi-API agree) | ${report.apiStats.consensusMatches} |\n`;
    markdown += `| Single API match | ${report.apiStats.singleMatches} |\n`;
    markdown += `| No match | ${report.apiStats.noMatches} |\n`;
    markdown += `| Flagged for review | ${report.apiStats.flaggedCount} |\n`;
    markdown += `| Discrepancies (original ≠ API) | ${report.apiStats.discrepancyCount} |\n`;
    markdown += `| AI-verified | ${report.apiStats.aiVerifiedCount} |\n`;
    markdown += '\n';
  }

  // AI Decisions — detailed audit trail
  if (report.aiReviewedEntries.length > 0) {
    markdown += `## AI Decisions (${report.aiReviewedEntries.length})\n\n`;
    markdown += `AI reviewed ${report.aiReviewedEntries.length} entries and made these decisions:\n`;
    markdown += `✅ Accepted: ${report.apiStats.aiAccepted} | ✏️ Corrected: ${report.apiStats.aiCorrected} | 🚫 Rejected: ${report.apiStats.aiRejected}\n\n`;

    // Group by decision type
    const byAction = new Map<string, ConsensusResult[]>();
    for (const entry of report.aiReviewedEntries) {
      const action = entry.aiDecision?.action || 'unknown';
      if (!byAction.has(action)) byAction.set(action, []);
      byAction.get(action)!.push(entry);
    }

    // Show rejections first (most important — AI kept original data)
    const rejections = byAction.get('rejected') || [];
    if (rejections.length > 0) {
      markdown += `### 🚫 Rejected — API data was wrong, kept original (${rejections.length})\n\n`;
      for (const entry of rejections.slice(0, 50)) {
        const filename = getEntryLabel(entry);
        markdown += `- **\`${filename}\`** — confidence (${entry.confidence})\n`;
        for (const pr of entry.providerResults) {
          if (pr.match) {
            markdown += `  - ${pr.provider}: "${pr.match.artist} — ${pr.match.title}" (${pr.match.confidence}%)\n`;
          } else {
            markdown += `  - ${pr.provider}: no match${pr.error ? ` (${pr.error})` : ''}\n`;
          }
        }
        markdown += `  - **AI decision**: ${entry.aiDecision?.reason || 'no reason given'}\n`;
        markdown += '\n';
      }
      if (rejections.length > 50) {
        markdown += `*... and ${rejections.length - 50} more*\n\n`;
      }
    }

    // Show corrections (AI fixed the data)
    const corrections = byAction.get('corrected') || [];
    if (corrections.length > 0) {
      markdown += `### ✏️ Corrected — AI fixed API data (${corrections.length})\n\n`;
      for (const entry of corrections.slice(0, 50)) {
        const filename = getEntryLabel(entry);
        markdown += `- **\`${filename}\`** — confidence (${entry.confidence})\n`;
        const origArtist = entry.originalInput?.artist || entry.artist || 'unknown';
        const origTitle = entry.originalInput?.title || entry.title || 'unknown';
        const chosenArtist = entry.aiDecision?.chosenArtist || entry.artist || 'unknown';
        const chosenTitle = entry.aiDecision?.chosenTitle || entry.title || 'unknown';
        markdown += `  - Original: "${origArtist} — ${origTitle}"\n`;
        markdown += `  - AI chose: "${chosenArtist} — ${chosenTitle}"\n`;
        for (const pr of entry.providerResults) {
          if (pr.match) {
            markdown += `  - ${pr.provider}: "${pr.match.artist} — ${pr.match.title}" (${pr.match.confidence}%)\n`;
          } else {
            markdown += `  - ${pr.provider}: no match${pr.error ? ` (${pr.error})` : ''}\n`;
          }
        }
        markdown += `  - **AI decision**: ${entry.aiDecision?.reason || 'no reason given'}\n`;
        markdown += '\n';
      }
      if (corrections.length > 50) {
        markdown += `*... and ${corrections.length - 50} more*\n\n`;
      }
    }

    // Show acceptances (brief, less detail needed)
    const acceptances = byAction.get('accepted') || [];
    if (acceptances.length > 0) {
      markdown += `### ✅ Accepted — API data confirmed correct (${acceptances.length})\n\n`;
      markdown += '<details>\n<summary>Click to expand</summary>\n\n';
      for (const entry of acceptances.slice(0, 100)) {
        const filename = getEntryLabel(entry);
        markdown += `- \`${filename}\` → "${entry.artist} — ${entry.title}"`;
        if (entry.aiDecision?.reason) {
          markdown += ` — ${entry.aiDecision.reason}`;
        }
        markdown += '\n';
      }
      if (acceptances.length > 100) {
        markdown += `\n*... and ${acceptances.length - 100} more*\n`;
      }
      markdown += '\n</details>\n\n';
    }
  }

  // Flagged entries still needing manual review
  if (report.flaggedEntries.length > 0) {
    markdown += `## Flagged Entries for Manual Review (${report.flaggedEntries.length})\n\n`;
    markdown += 'These entries need human verification. You can add corrections to `data/manual-overrides.json`.\n\n';

    // Group by flag reason
    const byReason = new Map<string, ConsensusResult[]>();
    for (const entry of report.flaggedEntries) {
      for (const reason of entry.flagReasons) {
        if (!byReason.has(reason)) byReason.set(reason, []);
        byReason.get(reason)!.push(entry);
      }
    }

    for (const [reason, entries] of byReason) {
      markdown += `### ${reason} (${entries.length})\n\n`;
      for (const entry of entries.slice(0, 30)) {
        const filename = getEntryLabel(entry);
        markdown += `- **\`${filename}\`** — confidence (${entry.confidence})\n`;
        for (const pr of entry.providerResults) {
          if (pr.match) {
            markdown += `  - ${pr.provider}: "${pr.match.artist} — ${pr.match.title}" (${pr.match.confidence}%)\n`;
          } else {
            markdown += `  - ${pr.provider}: no match${pr.error ? ` (${pr.error})` : ''}\n`;
          }
        }
        markdown += '\n';
      }
      if (entries.length > 30) {
        markdown += `*... and ${entries.length - 30} more*\n\n`;
      }
    }
  }

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
      markdown += `#### ${dup.normalizedKey}\n`;
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
