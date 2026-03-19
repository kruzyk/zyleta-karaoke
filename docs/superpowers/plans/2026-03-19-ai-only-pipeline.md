# AI-Only Pipeline Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the multi-API music metadata pipeline with a single AI enrichment module (Claude + Gemini fallback), simplify the scanner output, and update the frontend country model.

**Architecture:** New `scripts/ai-enricher.ts` replaces the entire `scripts/api-providers/` directory. Songs are sent to Claude API in batches of 30 for enrichment (artist canonicalization, year, country). The pipeline is reduced from 8 stages to 5. The country model changes from ~25 ISO codes to a closed set of 7 categories.

**Tech Stack:** TypeScript, Node.js, Claude API (`claude-sonnet-4-5-20250929`), Gemini API (`gemini-2.0-flash`), React, PowerShell

**Spec:** `docs/superpowers/specs/2026-03-19-ai-only-pipeline-design.md`

---

## Chunk 1: Foundation — Song Type + Country Utilities

### Task 1: Update Song type with SongCountry

**Files:**
- Modify: `src/types/song.ts`

- [ ] **Step 1: Add SongCountry type and update country field**

In `src/types/song.ts`, add the type alias before the `Song` interface and update the `country` field:

```typescript
export type SongCountry = 'PL' | 'EN' | 'Sweden' | 'Norway' | 'Spain' | 'Italy' | 'Germany';

export interface Song {
  id: string;
  artist: string;
  title: string;
  genre?: string;
  year?: number;
  album?: string;
  language?: string;
  country?: SongCountry;
}
```

Also update the `FilterState` interface's `country` field:

```typescript
export interface FilterState {
  main: MainFilter;
  decade: DecadeFilter | null;
  country: SongCountry | null;
}
```

- [ ] **Step 2: Verify build**

Run: `cd /sessions/admiring-youthful-feynman/mnt/karaoke-song-list && npx tsc --noEmit --project tsconfig.json 2>&1 | head -30`

Expected: Type errors in files that use `country` as a plain string — that's expected, we'll fix those in subsequent tasks.

- [ ] **Step 3: Commit**

```bash
git add src/types/song.ts
git commit -m "feat: add SongCountry type alias with closed set of country categories

Replace open-ended ISO 3166-1 alpha-2 string with a closed set:
PL, EN (English-speaking), Sweden, Norway, Spain, Italy, Germany."
```

---

### Task 2: Rewrite country-flags utility

**Files:**
- Modify: `src/utils/country-flags.ts`

- [ ] **Step 1: Replace country-flags.ts with lookup-based implementation**

Replace the entire file contents with:

```typescript
import type { SongCountry } from '@/types/song';

const COUNTRY_FLAGS: Record<SongCountry, string> = {
  PL: '🇵🇱',
  EN: '🇬🇧',
  Sweden: '🇸🇪',
  Norway: '🇳🇴',
  Spain: '🇪🇸',
  Italy: '🇮🇹',
  Germany: '🇩🇪',
};

export function countryCodeToFlag(code: SongCountry): string {
  return COUNTRY_FLAGS[code] ?? '';
}

const COUNTRY_NAMES: Record<string, Record<SongCountry, string>> = {
  en: {
    PL: 'Poland',
    EN: 'English',
    Sweden: 'Sweden',
    Norway: 'Norway',
    Spain: 'Spain',
    Italy: 'Italy',
    Germany: 'Germany',
  },
  pl: {
    PL: 'Polska',
    EN: 'Angielski',
    Sweden: 'Szwecja',
    Norway: 'Norwegia',
    Spain: 'Hiszpania',
    Italy: 'Włochy',
    Germany: 'Niemcy',
  },
};

export function getCountryName(code: SongCountry, lang: string = 'en'): string {
  const names = COUNTRY_NAMES[lang] || COUNTRY_NAMES.en;
  return names[code] || code;
}
```

- [ ] **Step 2: Verify no type errors in this file**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | grep country-flags`

Expected: No errors from country-flags.ts itself.

- [ ] **Step 3: Commit**

```bash
git add src/utils/country-flags.ts
git commit -m "refactor: replace Regional Indicator algorithm with lookup-based country flags

New closed set of 7 country categories with direct flag/name mappings
instead of computing flags from ISO alpha-2 codes."
```

---

### Task 3: Update useFilter hook — fixed country list

**Files:**
- Modify: `src/hooks/useFilter.ts`

- [ ] **Step 1: Replace getAvailableCountries with fixed array**

In `src/hooks/useFilter.ts`, replace the `getAvailableCountries` function (lines 43–52) with:

```typescript
/** Fixed set of international country categories (excluding PL which has its own main chip) */
function getAvailableCountries(): SongCountry[] {
  return ['EN', 'Sweden', 'Norway', 'Spain', 'Italy', 'Germany'];
}
```

Update the existing import at the top of the file — add `SongCountry` to it:

```typescript
import type { Song, MainFilter, DecadeFilter, FilterState, SongCountry } from '@/types/song';
```

(The original import has `Song, MainFilter, DecadeFilter, FilterState` — just add `SongCountry`.)

Update the `useMemo` call for `availableCountries` to remove the `allSongs` dependency since it's now static:

```typescript
const availableCountries = useMemo(() => getAvailableCountries(), []);
```

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit --project tsconfig.json 2>&1 | head -30`

Expected: Clean compile (or only unrelated errors from scripts/).

- [ ] **Step 3: Run existing tests**

Run: `cd /sessions/admiring-youthful-feynman/mnt/karaoke-song-list && npx vitest run 2>&1 | tail -20`

Expected: All existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useFilter.ts
git commit -m "refactor: use fixed country list instead of dynamic extraction

Country categories are now a closed set, no need to extract from data."
```

---

## Chunk 2: AI Enricher Module

### Task 4: Create ai-enricher.ts

**Files:**
- Create: `scripts/ai-enricher.ts`

- [ ] **Step 1: Create the AI enricher module**

Create `scripts/ai-enricher.ts` with the full implementation. This is the core new module that replaces all API providers.

```typescript
/**
 * AI-based song metadata enrichment.
 *
 * Sends songs in batches to Claude API (primary) or Gemini API (fallback)
 * to get canonical artist names, original release years, and country of origin.
 */
import type { SongCountry } from '../src/types/song.js';

export interface AiEnrichmentInput {
  artist: string;
  title: string;
}

export interface AiEnrichmentResult {
  artist: string;
  title: string;
  country: SongCountry | null;
  year: number | null;
}

export interface AiEnrichmentStats {
  totalBatches: number;
  enrichedCount: number;
  skippedCount: number;
  failedBatches: number;
  provider: string;
  nullYearCount: number;
  nullCountryCount: number;
}

const VALID_COUNTRIES: Set<string> = new Set([
  'PL', 'EN', 'Sweden', 'Norway', 'Spain', 'Italy', 'Germany',
]);

const SYSTEM_PROMPT = `You are a music metadata expert. For each song, provide:
- artist: canonical artist name (fix typos, e.g. "ACDC" → "AC/DC", "2 plus 1" → "2+1")
- title: canonical song title
- year: original FIRST RELEASE year (integer or null). Use the year the song was FIRST published,
  NOT a remaster, compilation, or re-release year. Example: Beatles "Help!" = 1965, not 2017.
- country: artist's country of origin, from this CLOSED SET ONLY:
  "PL" = Poland
  "EN" = English-speaking: UK, Ireland, USA, Canada, Australia, New Zealand, Jamaica, South Africa, Malta, and other English-speaking nations
  "Sweden" = Sweden
  "Norway" = Norway
  "Spain" = Spain
  "Italy" = Italy
  "Germany" = Germany, Austria, German-speaking Switzerland
  null = any other country (France, Japan, Brazil, Finland, etc.) or unknown

Return a JSON array. If you don't know year or country, use null — never guess.
For collaborations (e.g. "Artist A & Artist B"), use the PRIMARY artist's country.

Examples:
Input: [{"artist":"beatles","title":"help"}]
Output: [{"artist":"The Beatles","title":"Help!","year":1965,"country":"EN"}]

Input: [{"artist":"ABBA","title":"waterloo"}]
Output: [{"artist":"ABBA","title":"Waterloo","year":1974,"country":"Sweden"}]

Input: [{"artist":"edith piaf","title":"la vie en rose"}]
Output: [{"artist":"Edith Piaf","title":"La Vie en rose","year":1947,"country":null}]`;

function validateCountry(value: unknown): SongCountry | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && VALID_COUNTRIES.has(value)) return value as SongCountry;
  return null;
}

function validateYear(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isInteger(num)) return null;
  const currentYear = new Date().getFullYear();
  if (num < 1800 || num > currentYear) return null;
  return num;
}

function validateResponse(
  response: unknown[],
  inputLength: number,
): AiEnrichmentResult[] | null {
  if (!Array.isArray(response)) return null;
  if (response.length !== inputLength) return null;

  return response.map((item) => ({
    artist: typeof item.artist === 'string' ? item.artist : '',
    title: typeof item.title === 'string' ? item.title : '',
    country: validateCountry(item.country),
    year: validateYear(item.year),
  }));
}

async function callClaude(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Unexpected Claude response format');
  return text;
}

async function callGemini(
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not set');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userMessage }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Unexpected Gemini response format');
  return text;
}

type AiProvider = 'claude' | 'gemini';

async function callAiProvider(
  provider: AiProvider,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  if (provider === 'claude') return callClaude(systemPrompt, userMessage);
  return callGemini(systemPrompt, userMessage);
}

function parseJsonFromResponse(text: string): unknown[] {
  // Try direct parse first
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
  } catch { /* ignore */ }

  // Try extracting JSON from markdown code block
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (match) {
    const parsed = JSON.parse(match[1].trim());
    if (Array.isArray(parsed)) return parsed;
  }

  throw new Error('Could not parse JSON array from AI response');
}

async function enrichBatch(
  batch: AiEnrichmentInput[],
  primaryProvider: AiProvider,
  fallbackProvider: AiProvider | null,
): Promise<{ results: AiEnrichmentResult[]; provider: AiProvider }> {
  const userMessage = JSON.stringify(
    batch.map((s) => ({ artist: s.artist, title: s.title })),
  );

  // Try primary provider (with one retry)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = await callAiProvider(primaryProvider, SYSTEM_PROMPT, userMessage);
      const parsed = parseJsonFromResponse(text);
      const validated = validateResponse(parsed, batch.length);
      if (validated) return { results: validated, provider: primaryProvider };
      // Invalid response shape — retry
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`   ⚠️ ${primaryProvider} attempt ${attempt + 1} failed: ${msg}`);
    }
  }

  // Try fallback provider (with one retry)
  if (fallbackProvider) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const text = await callAiProvider(fallbackProvider, SYSTEM_PROMPT, userMessage);
        const parsed = parseJsonFromResponse(text);
        const validated = validateResponse(parsed, batch.length);
        if (validated) return { results: validated, provider: fallbackProvider };
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`   ⚠️ ${fallbackProvider} attempt ${attempt + 1} failed: ${msg}`);
      }
    }
  }

  throw new Error('Both AI providers failed for batch');
}

function determinePrimaryProvider(): { primary: AiProvider; fallback: AiProvider | null } {
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasGemini = Boolean(process.env.GEMINI_API_KEY);

  if (!hasClaude && !hasGemini) {
    throw new Error(
      'No AI provider configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY.',
    );
  }

  if (hasClaude) return { primary: 'claude', fallback: hasGemini ? 'gemini' : null };
  return { primary: 'gemini', fallback: null };
}

export async function enrichWithAi(
  songs: AiEnrichmentInput[],
  options?: { batchSize?: number },
): Promise<{ results: AiEnrichmentResult[]; stats: AiEnrichmentStats }> {
  const batchSize = options?.batchSize ?? 30;
  const { primary, fallback } = determinePrimaryProvider();

  console.log(`   AI enrichment: ${songs.length} songs, batch size ${batchSize}`);
  console.log(`   Primary: ${primary}${fallback ? `, fallback: ${fallback}` : ''}`);

  const stats: AiEnrichmentStats = {
    totalBatches: Math.ceil(songs.length / batchSize),
    enrichedCount: 0,
    skippedCount: 0,
    failedBatches: 0,
    provider: primary,
    nullYearCount: 0,
    nullCountryCount: 0,
  };

  const allResults: AiEnrichmentResult[] = [];

  for (let i = 0; i < songs.length; i += batchSize) {
    const batch = songs.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    try {
      const { results, provider } = await enrichBatch(batch, primary, fallback);
      allResults.push(...results);
      stats.enrichedCount += results.length;
      if (provider !== primary) stats.provider = provider;

      // Count nulls
      for (const r of results) {
        if (r.year === null) stats.nullYearCount++;
        if (r.country === null) stats.nullCountryCount++;
      }

      console.log(
        `   Batch ${batchNum}/${stats.totalBatches}: ${results.length} songs enriched`,
      );
    } catch {
      console.error(
        `   ❌ Batch ${batchNum}/${stats.totalBatches}: FAILED — using original data`,
      );
      stats.failedBatches++;

      // Fall back to original parsed data with null metadata
      for (const song of batch) {
        allResults.push({
          artist: song.artist,
          title: song.title,
          country: null,
          year: null,
        });
      }
      stats.skippedCount += batch.length;
    }
  }

  return { results: allResults, stats };
}
```

- [ ] **Step 2: Verify the file parses correctly with tsx**

Run: `cd /sessions/admiring-youthful-feynman/mnt/karaoke-song-list && npx tsx -e "import('./scripts/ai-enricher.js').then(() => console.log('OK'))"`

Expected: "OK" (no syntax/import errors). The module won't actually call APIs — just import validation.

- [ ] **Step 3: Commit**

```bash
git add scripts/ai-enricher.ts
git commit -m "feat: add AI enricher module for batch song metadata enrichment

Single module replacing the multi-API orchestrator. Uses Claude API
as primary provider with Gemini fallback. Processes songs in batches
of 30 with validation, retry logic, and graceful degradation."
```

---

## Chunk 3: Pipeline Rewrite

### Task 5: Rewrite process-filelist.ts

**Files:**
- Modify: `scripts/process-filelist.ts`

This is the largest change. The entire file is rewritten with a simplified 5-stage pipeline.

- [ ] **Step 1: Rewrite process-filelist.ts**

Replace the entire contents of `scripts/process-filelist.ts` with:

```typescript
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
  aiStats: AiEnrichmentStats;
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

  console.log('🎤 Żyleta Karaoke — Processing song list (AI enrichment)');
  if (forceRefresh) {
    console.log('   *** FORCE MODE — re-enriching ALL songs ***');
  }
  console.log('');

  const report: PipelineReport = {
    generatedAt: new Date().toISOString(),
    totalRawFiles: 0,
    totalParsed: 0,
    parseFailures: [],
    parseFailureCount: 0,
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
    },
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
  console.log(`   Parsed: ${withArtist.length} with artist, ${noArtist.length} without`);
  report.totalParsed = withArtist.length;
  report.parseFailureCount = noArtist.length;

  if (noArtist.length > 0) {
    console.log('   Files without detected artist:');
    for (const p of noArtist) {
      console.log(`     - ${p.filename}`);
      report.parseFailures.push(p.filename);
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

  // Find songs not yet in existing data
  const newSongs = withArtist.filter((p) => {
    const key = `${normalizeForDedup(p.artist)}||${normalizeForDedup(p.title)}`;
    return !existingMap.has(key);
  });

  const songsToEnrich = forceRefresh ? withArtist : newSongs;
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
      const existingScore = (existing.song.country ? 1 : 0) + (existing.song.year ? 1 : 0);
      const newScore = (song.country ? 1 : 0) + (song.year ? 1 : 0);
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

async function savePipelineReport(report: PipelineReport): Promise<string> {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
  const dateStr = new Date().toISOString().split('T')[0];
  const reportPath = path.join(REPORTS_DIR, `${dateStr}_pipeline-report.md`);

  let md = '# Żyleta Karaoke — Pipeline Report\n\n';
  md += `Generated: ${report.generatedAt}\n\n`;

  md += '## Summary\n\n';
  md += '| Metric | Value |\n|--------|-------|\n';
  md += `| Raw files | ${report.totalRawFiles} |\n`;
  md += `| Parsed | ${report.totalParsed} (${report.summaryStats.parseSuccessRate}%) |\n`;
  md += `| Parse failures | ${report.parseFailureCount} |\n`;
  md += `| Duplicates removed | ${report.duplicateRemovedCount} |\n`;
  md += `| Final songs | ${report.finalCount} |\n\n`;

  md += '## AI Enrichment\n\n';
  md += '| Metric | Value |\n|--------|-------|\n';
  md += `| Provider | ${report.aiStats.provider} |\n`;
  md += `| Batches | ${report.aiStats.totalBatches} |\n`;
  md += `| Enriched | ${report.aiStats.enrichedCount} |\n`;
  md += `| Skipped (already in songs.json) | ${report.aiStats.skippedCount} |\n`;
  md += `| Failed batches | ${report.aiStats.failedBatches} |\n`;
  md += `| Null years | ${report.aiStats.nullYearCount} |\n`;
  md += `| Null countries | ${report.aiStats.nullCountryCount} |\n\n`;

  md += '## Metadata Coverage\n\n';
  const countryPct = report.finalCount > 0
    ? Math.round(((report.finalCount - report.missingMetadata.countryCount) / report.finalCount) * 100)
    : 0;
  const yearPct = report.finalCount > 0
    ? Math.round(((report.finalCount - report.missingMetadata.yearCount) / report.finalCount) * 100)
    : 0;
  md += `Country: ${countryPct}% coverage (${report.missingMetadata.countryCount} missing)\n\n`;
  md += `Year: ${yearPct}% coverage (${report.missingMetadata.yearCount} missing)\n\n`;

  if (report.parseFailures.length > 0) {
    md += `## Parse Failures (${report.parseFailureCount})\n\n`;
    for (const file of report.parseFailures) md += `- \`${file}\`\n`;
    md += '\n';
  }

  if (report.duplicatesRemoved.length > 0) {
    md += `## Duplicates Removed (${report.duplicateRemovedCount})\n\n`;
    for (const dup of report.duplicatesRemoved) {
      md += `- **${dup.normalizedKey}** (kept: \`${dup.keptId}\`)\n`;
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
```

- [ ] **Step 2: Verify imports resolve**

Run: `npx tsx -e "import('./scripts/ai-enricher.js').then(() => console.log('imports OK'))" 2>&1 | head -5`

Expected: "imports OK" — confirms the import chain (process-filelist → ai-enricher → types/song) works without errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/process-filelist.ts
git commit -m "feat: rewrite pipeline with AI-only enrichment (5-stage)

Replace 8-stage multi-API pipeline with simplified 5-stage pipeline:
READ → PARSE → DIFF → ENRICH → MERGE. Supports incremental mode
(default) and force mode (--force). No more API providers, consensus
logic, or cache management."
```

---

### Task 6: Update dedup.ts Song import

**Files:**
- Modify: `scripts/dedup.ts`

- [ ] **Step 1: Change Song import from musicbrainz.js to types/song.js**

In `scripts/dedup.ts`, replace line 2:

```typescript
import type { Song } from './musicbrainz.js';
```

with:

```typescript
import type { Song } from '../src/types/song.js';
```

- [ ] **Step 2: Verify import resolves**

Run: `npx tsx -e "import('./scripts/dedup.js').then(() => console.log('dedup OK'))" 2>&1`

Expected: "dedup OK"

- [ ] **Step 3: Commit**

```bash
git add scripts/dedup.ts
git commit -m "refactor: update Song import in dedup.ts to use src/types/song

Prepare for deletion of musicbrainz.ts by importing Song from
the canonical source."
```

---

### Task 7: Delete legacy API provider files

**Files:**
- Delete: `scripts/api-providers/orchestrator.ts`
- Delete: `scripts/api-providers/musicbrainz-provider.ts`
- Delete: `scripts/api-providers/discogs.ts`
- Delete: `scripts/api-providers/lastfm.ts`
- Delete: `scripts/api-providers/ai-verifier.ts`
- Delete: `scripts/api-providers/ai-input-validator.ts`
- Delete: `scripts/api-providers/country-validator.ts`
- Delete: `scripts/api-providers/types.ts`
- Delete: `scripts/api-providers/index.ts`
- Delete: `scripts/musicbrainz.ts`
- Delete: `scripts/update-songs.ts`

- [ ] **Step 1: Delete all legacy files**

```bash
rm scripts/api-providers/orchestrator.ts
rm scripts/api-providers/musicbrainz-provider.ts
rm scripts/api-providers/discogs.ts
rm scripts/api-providers/lastfm.ts
rm scripts/api-providers/ai-verifier.ts
rm scripts/api-providers/ai-input-validator.ts
rm scripts/api-providers/country-validator.ts
rm scripts/api-providers/types.ts
rm scripts/api-providers/index.ts
rmdir scripts/api-providers
rm scripts/musicbrainz.ts
rm scripts/update-songs.ts
```

- [ ] **Step 2: Update package.json update-songs script**

In `package.json`, change the `update-songs` script from:

```json
"update-songs": "npx tsx scripts/update-songs.ts"
```

to:

```json
"update-songs": "npx tsx scripts/process-filelist.ts"
```

- [ ] **Step 3: Verify no dangling imports**

Run: `grep -r "api-providers\|musicbrainz\|update-songs" scripts/ --include="*.ts" 2>/dev/null`

Expected: No results (all references to deleted files are gone). If any results appear, update the file that still references the deleted module.

- [ ] **Step 4: Commit**

```bash
git add -A scripts/api-providers/ scripts/musicbrainz.ts scripts/update-songs.ts package.json
git commit -m "chore: delete legacy API providers and musicbrainz module

Remove 11 files: orchestrator, MusicBrainz/Discogs/Last.fm providers,
AI verifier, input validator, country validator, types, barrel export,
musicbrainz wrapper, and update-songs CLI. All replaced by ai-enricher.ts."
```

---

## Chunk 4: Scanner + Workflow + Data Migration

### Task 8: Simplify scan-and-upload.ps1

**Files:**
- Modify: `scripts/remote-scan/scan-and-upload.ps1`

- [ ] **Step 1: Simplify file entry creation and add .mp3 filter**

In `scripts/remote-scan/scan-and-upload.ps1`, replace lines 148–161 (the inner loop that builds file entries):

Old code (lines 148–162):
```powershell
    $folderFileCount = 0
    $folderRoot = $folder.TrimEnd('\', '/')
    foreach ($f in $allFiles) {
        if ($extSet.Contains($f.Extension)) {
            $relativePath = $f.FullName.Substring($folderRoot.Length).TrimStart('\', '/')
            $files.Add(@{
                filename     = $f.Name
                relativePath = $relativePath
                sourceFolder = $folderName
                extension    = $f.Extension.ToLower()
                sizeBytes    = $f.Length
            })
            $folderFileCount++
        }
    }
```

New code:
```powershell
    $folderFileCount = 0
    foreach ($f in $allFiles) {
        if ($extSet.Contains($f.Extension) -and $f.Extension -ne '.mp3') {
            $files.Add(@{
                filename     = $f.Name
                sourceFolder = $folderName
            })
            $folderFileCount++
        }
    }
```

Key changes:
- Remove `$folderRoot` variable (no longer needed)
- Add `-and $f.Extension -ne '.mp3'` to filter out .mp3 files
- Remove `relativePath`, `extension`, `sizeBytes` from file entries
- Keep only `filename` and `sourceFolder`

- [ ] **Step 2: Update scan-config.example.json to remove .mp3**

In `scripts/remote-scan/scan-config.example.json`, change the `fileExtensions` to:

```json
"fileExtensions": [".kfn", ".wav", ".mid", ".kar", ".mp4", ".avi", ".mkv", ".cdg", ".wmv"]
```

(Remove `.mp3` from the list.)

- [ ] **Step 3: Commit**

```bash
git add scripts/remote-scan/scan-and-upload.ps1 scripts/remote-scan/scan-config.example.json
git commit -m "refactor: simplify scanner output and filter out .mp3 files

Remove extension, sizeBytes, relativePath from file entries (unused).
Filter .mp3 files which duplicate .cdg files in karaoke sets."
```

---

### Task 9: Update GitHub Actions workflow

**Files:**
- Modify: `.github/workflows/update-songs.yml`

- [ ] **Step 1: Update the workflow file**

Make these changes to `.github/workflows/update-songs.yml`:

**a)** Update `force_refresh` description (line 11):
```yaml
        description: 'Force re-process all songs with AI (ignore existing data)'
```

**b)** Remove the "Restore API cache" step (lines 65–76) entirely.

**c)** Remove the "Clear cache (force refresh)" step (lines 78–82) entirely.

**d)** In "Validate API tokens" step, remove MusicBrainz, Discogs, and Last.fm validation. Keep only Claude AI and Gemini AI. Update descriptions:
```yaml
      - name: Validate API tokens
        run: |
          echo "## API Token Status" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
          echo "| Provider | Token | Status |" >> $GITHUB_STEP_SUMMARY
          echo "|----------|-------|--------|" >> $GITHUB_STEP_SUMMARY

          # Claude AI (primary)
          if [ -n "$ANTHROPIC_API_KEY" ]; then
            echo "| Claude AI | configured | ✅ Primary provider |" >> $GITHUB_STEP_SUMMARY
          else
            echo "| Claude AI | not configured | ⚠️ Not available |" >> $GITHUB_STEP_SUMMARY
          fi

          # Gemini AI (fallback)
          if [ -n "$GEMINI_API_KEY" ]; then
            echo "| Gemini AI | configured | ✅ Fallback provider |" >> $GITHUB_STEP_SUMMARY
          else
            echo "| Gemini AI | not configured | ⏭️ No fallback |" >> $GITHUB_STEP_SUMMARY
          fi

          # At least one provider must be configured
          if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$GEMINI_API_KEY" ]; then
            echo "::error::No AI provider configured. Set ANTHROPIC_API_KEY or GEMINI_API_KEY."
            exit 1
          fi

          echo "" >> $GITHUB_STEP_SUMMARY
          echo "---" >> $GITHUB_STEP_SUMMARY
          echo "" >> $GITHUB_STEP_SUMMARY
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

**e)** In "Process raw file list" step, remove `MUSICBRAINZ_ENABLED`, `DISCOGS_TOKEN`, `LASTFM_API_KEY` env vars. Keep only:
```yaml
        env:
          REPORTS_DIR: /tmp/pipeline-reports
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/update-songs.yml'))" && echo "Valid YAML"`

Expected: "Valid YAML"

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/update-songs.yml
git commit -m "chore: update CI workflow for AI-only pipeline

Remove API cache restore/clear steps, remove Discogs/Last.fm/MusicBrainz
token validation. Add check that at least one AI provider is configured.
Remove unused env vars."
```

---

### Task 10: Migrate raw-filelist.json data format

**Files:**
- Modify: `data/raw-filelist.json`

- [ ] **Step 1: Strip old fields from raw-filelist.json**

Write a quick script to transform the existing data:

```bash
cd /sessions/admiring-youthful-feynman/mnt/karaoke-song-list
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('data/raw-filelist.json', 'utf-8'));
const filtered = data.files
  .filter(f => !f.filename.endsWith('.mp3'))
  .map(f => ({ filename: f.filename, sourceFolder: f.sourceFolder }));
data.files = filtered;
data.totalFiles = filtered.length;
fs.writeFileSync('data/raw-filelist.json', JSON.stringify(data, null, 2) + '\n', 'utf-8');
console.log('Migrated: ' + filtered.length + ' files (removed .mp3 and extra fields)');
"
```

- [ ] **Step 2: Verify the new format**

Run: `node -e "const d=JSON.parse(require('fs').readFileSync('data/raw-filelist.json','utf-8')); const f=d.files[0]; console.log(JSON.stringify(f)); console.log('Total:', d.files.length)"`

Expected: `{"filename":"...","sourceFolder":"..."}` — only `filename` and `sourceFolder`, no `extension`/`sizeBytes`/`relativePath`.

- [ ] **Step 3: Commit**

```bash
git add data/raw-filelist.json
git commit -m "chore: migrate raw-filelist.json to simplified format

Remove extension, sizeBytes, relativePath fields. Filter out .mp3 files."
```

---

## Chunk 5: Verification

### Task 11: Full build verification

- [ ] **Step 1: Run TypeScript type check**

Run: `cd /sessions/admiring-youthful-feynman/mnt/karaoke-song-list && npx tsc --noEmit --project tsconfig.json 2>&1`

Expected: Clean compile with no errors.

- [ ] **Step 2: Run linter**

Run: `npm run lint 2>&1 | tail -20`

Expected: No errors.

- [ ] **Step 3: Run tests**

Run: `npm test 2>&1`

Expected: All existing tests pass.

- [ ] **Step 4: Run production build**

Run: `npm run build 2>&1 | tail -10`

Expected: Build succeeds.

- [ ] **Step 5: Verify no references to deleted modules**

Run: `grep -r "musicbrainz\|orchestrator\|discogs\|lastfm\|api-providers\|ConsensusResult\|ProviderHealth" src/ scripts/ .github/ --include="*.ts" --include="*.tsx" --include="*.yml" 2>/dev/null`

Expected: No results (all references to old modules are gone).

- [ ] **Step 6: Verify pipeline dry-run parses correctly**

Run: `npx tsx -e "import { enrichWithAi } from './scripts/ai-enricher.js'; console.log('ai-enricher: OK')" 2>&1`

Expected: "ai-enricher: OK" (import works).

- [ ] **Step 7: Fix any issues found in steps 1–6**

If any step fails, fix the issue and re-run the failed step.

- [ ] **Step 8: Final commit (if fixes were needed)**

```bash
git add -A
git commit -m "fix: address build/lint/test issues from pipeline rewrite"
```
