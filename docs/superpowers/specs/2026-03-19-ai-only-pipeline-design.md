# Design: Replace Music API Pipeline with AI-Only Enrichment

**Date**: 2026-03-19
**Status**: Draft
**Branch**: `feature/ai-only-pipeline`

## Problem

The current pipeline queries 3 music APIs (MusicBrainz, Discogs, Last.fm) and uses AI only for verification of flagged entries. This approach:

1. Returns remaster/compilation dates instead of original release years (68.8% of years disagree with AI knowledge)
2. Adds complexity with consensus-building, provider health tracking, caching, and rate limiting
3. Requires maintaining API tokens and handling auth failures
4. Still needs AI verification for correctness — making the API step redundant

## Solution

Replace the entire multi-API orchestrator with a single AI enrichment module. The AI (Claude API, Gemini as fallback) processes songs in batches, providing artist name canonicalization, original release year, and artist country of origin — all in one step.

Additionally, simplify `raw-filelist.json` by removing unused fields (`extension`, `sizeBytes`, `relativePath`) and filtering out `.mp3` files from the scanner (they duplicate `.cdg` files).

## Country Model Change

Replace granular ISO 3166-1 alpha-2 country codes with a simplified category system for UI filtering:

```typescript
type SongCountry = "PL" | "EN" | "Sweden" | "Norway" | "Spain" | "Italy" | "Germany" | null;
```

Mapping rules for AI enrichment:

| Value | Meaning | Flag | Includes |
|-------|---------|------|----------|
| `"PL"` | Polish artists | 🇵🇱 | Poland |
| `"EN"` | English-speaking | 🇬🇧 | England, Scotland, Wales, Northern Ireland, Ireland, Malta, USA, Canada, Australia, New Zealand, Jamaica, South Africa |
| `"Sweden"` | Swedish artists | 🇸🇪 | Sweden |
| `"Norway"` | Norwegian artists | 🇳🇴 | Norway |
| `"Spain"` | Spanish artists | 🇪🇸 | Spain |
| `"Italy"` | Italian artists | 🇮🇹 | Italy |
| `"Germany"` | German artists | 🇩🇪 | Germany, Austria, Switzerland (German-speaking) |
| `null` | Other / unknown | — | France, Japan, Brazil, etc. |

UI behavior: main chip "International" (Zagraniczne) shows all non-PL songs; sub-chips filter by the 6 categories above. Songs with `country: null` are visible when International is active but no sub-chip is selected.

## Architecture

### New File: `scripts/ai-enricher.ts`

Single module replacing the entire `scripts/api-providers/` directory.

```typescript
interface AiEnrichmentInput {
  artist: string;   // parsed from filename
  title: string;    // parsed from filename
}

interface AiEnrichmentResult {
  artist: string;   // canonicalized name (e.g., "AC/DC" not "ACDC")
  title: string;    // canonical title
  country: SongCountry;  // from closed set above, or null
  year: number | null;   // original first release year
}

async function enrichWithAi(
  songs: AiEnrichmentInput[],
  options?: { batchSize?: number }
): Promise<AiEnrichmentResult[]>
```

**Batch processing**:
- Default batch size: 30 songs per API call
- Prompt instructs AI to return JSON array with canonical artist/title, country (from closed set), and original first release year
- Each batch is a single Claude API call (`claude-sonnet-4-5-20250929`)
- On failure: retry once, then try Gemini API (`gemini-2.0-flash`) as fallback
- Progress logging: `Batch 5/134: 30 songs enriched`

**AI Provider selection**:
- Primary: Claude API (requires `ANTHROPIC_API_KEY`)
- Fallback: Gemini API (requires `GEMINI_API_KEY`)
- If neither key is available, pipeline exits with error

**Prompt template** (system message for AI):

```
You are a music metadata expert. For each song, provide:
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
```

**User message per batch**: JSON array of `{ artist, title }` objects.

**Expected response**: JSON array of `{ artist, title, year, country }` objects, same order as input.

**Response validation**:
- Parse JSON; if invalid, retry once with same provider, then fallback provider
- Validate `country` is in closed set or null; reject unknown values (set to null)
- Validate `year` is integer between 1800 and current year (inclusive) or null; reject out-of-range (set to null)
- If response array length doesn't match input, retry once then fall back
- Extra fields in response objects are silently ignored

**Error handling for batches**:
- On API error: retry once with same provider, then try fallback provider
- If both providers fail for a batch: log error, skip batch, continue with remaining batches
- Skipped songs get `year: null, country: null` with original parsed artist/title
- Never fail the entire pipeline due to AI errors — degrade gracefully

### Simplified Pipeline: `scripts/process-filelist.ts`

New 5-stage pipeline (down from 8):

```
1. READ      → Load raw-filelist.json
2. PARSE     → Parse filenames → artist/title (reuse filename-parser.ts)
3. DIFF      → Compare with existing songs.json → find new songs
              (--force flag processes ALL songs)
4. ENRICH    → Send new songs to AI in batches → get canonical data + metadata
5. MERGE     → Combine existing + new, deduplicate, apply manual overrides,
              write songs.json, generate report
```

**Incremental mode** (default):
- Load existing `songs.json`
- Build lookup map by normalized `artist||title` (using `normalizeForDedup` from existing code)
- Only send songs NOT already in the map to AI enrichment
- Merge: existing entries kept as-is + new AI-enriched entries added
- Then: deduplicate the merged result (preferring entries with more metadata)
- Then: apply manual overrides (overrides always win over AI data)

**Force mode** (`--force`):
- Process ALL songs through AI enrichment (ignore existing songs.json)
- Then: deduplicate
- Then: apply manual overrides
- Write fresh `songs.json`

**Order of operations** (both modes): Parse → Diff → AI Enrich → Merge → Dedup → Manual Overrides → Write

### Simplified `raw-filelist.json`

**Before**:
```json
{
  "extension": ".mp3",
  "sizeBytes": 2639702,
  "filename": "1910 Fruitgum Co. - Simon Says.mp3",
  "sourceFolder": "Extra",
  "relativePath": "1910 Fruitgum Co. - Simon Says.mp3"
}
```

**After**:
```json
{
  "filename": "1910 Fruitgum Co. - Simon Says.cdg",
  "sourceFolder": "Extra"
}
```

Changes to `scan-and-upload.ps1`:
- Remove `extension`, `sizeBytes`, `relativePath` from file entries
- Skip files with `.mp3` extension (they duplicate `.cdg` files)
- Keep: `filename`, `sourceFolder` per entry; `scannedAt`, `folderPaths`, `totalFiles` at root level

### Changes to `process-filelist.ts`

- Remove `RawFileEntry` fields: `extension`, `sizeBytes`, `relativePath`
- Remove: import of `createOrchestrator`, `verifyWithAi`, `preValidateInputs`, `normalizeCountry`
- Remove: import of `ConsensusResult`, `ProviderHealth` types
- Remove: entire API resolution stage (step 3 in old pipeline)
- Remove: AI pre-validation stage (step 2.5)
- Remove: AI verification of flagged entries stage (step 4)
- Remove: country normalization step
- Remove: discrepancy detection
- Add: import of new `enrichWithAi` from `./ai-enricher.js`
- Add: incremental diff logic (compare parsed songs vs existing songs.json)
- Simplify: `PipelineReport` — remove `apiStats`, `providerHealth`, `flaggedEntries`, `aiReviewedEntries`; add:
  ```typescript
  aiStats: {
    totalBatches: number;
    enrichedCount: number;
    skippedCount: number;     // already in songs.json (incremental)
    failedBatches: number;
    provider: string;         // "claude" or "gemini"
    nullYearCount: number;    // songs where AI returned null year
    nullCountryCount: number; // songs where AI returned null country
  }
  ```

### Frontend Changes

**`src/types/song.ts`**:
- Add type alias: `export type SongCountry = "PL" | "EN" | "Sweden" | "Norway" | "Spain" | "Italy" | "Germany";`
- Change `country` field to: `country?: SongCountry;` (null/undefined = other/unknown)

**`src/utils/country-flags.ts`**:
- Replace `countryCodeToFlag()` with lookup-based implementation (no more Regional Indicator Symbol algorithm):
  ```typescript
  const COUNTRY_FLAGS: Record<string, string> = {
    PL: '🇵🇱', EN: '🇬🇧', Sweden: '🇸🇪', Norway: '🇳🇴',
    Spain: '🇪🇸', Italy: '🇮🇹', Germany: '🇩🇪',
  };
  export function countryCodeToFlag(code: string): string {
    return COUNTRY_FLAGS[code] ?? '';
  }
  ```
- Replace `COUNTRY_NAMES` with new codes:
  ```typescript
  const COUNTRY_NAMES: Record<string, Record<string, string>> = {
    en: { PL: 'Poland', EN: 'English', Sweden: 'Sweden', Norway: 'Norway', Spain: 'Spain', Italy: 'Italy', Germany: 'Germany' },
    pl: { PL: 'Polska', EN: 'Angielski', Sweden: 'Szwecja', Norway: 'Norwegia', Spain: 'Hiszpania', Italy: 'Włochy', Germany: 'Niemcy' },
  };
  ```

**`src/hooks/useFilter.ts`**:
- `getAvailableCountries()`: return fixed array `["EN", "Sweden", "Norway", "Spain", "Italy", "Germany"]` instead of dynamic extraction
- `filterByMain('international')`: keep current behavior: `s.country != null && s.country !== 'PL'` — songs with `null` country are only visible in "all" view (unchanged from current behavior)
- No change to `filterByCountry()` — it already uses exact match

### GitHub Actions: `update-songs.yml`

- Remove: "Restore API cache" step (no more cache.json, discogs-cache, etc.)
- Remove: "Clear cache (force refresh)" step
- Remove: "Validate API tokens" for Discogs and Last.fm
- Keep: "Validate API tokens" for Claude AI and Gemini AI
- Update: `force_refresh` input description → "Force re-process all songs with AI (ignore existing data)"
- Update: env vars — remove `MUSICBRAINZ_ENABLED`, `DISCOGS_TOKEN`, `LASTFM_API_KEY`
- Keep: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `REPORTS_DIR`

## Files to Delete

| File | Reason |
|------|--------|
| `scripts/api-providers/orchestrator.ts` | Replaced by ai-enricher.ts |
| `scripts/api-providers/musicbrainz-provider.ts` | No longer querying MusicBrainz |
| `scripts/api-providers/discogs.ts` | No longer querying Discogs |
| `scripts/api-providers/lastfm.ts` | No longer querying Last.fm |
| `scripts/api-providers/ai-verifier.ts` | AI now does enrichment directly, not verification |
| `scripts/api-providers/ai-input-validator.ts` | Pre-validation no longer needed |
| `scripts/api-providers/country-validator.ts` | Country normalization replaced by closed set |
| `scripts/api-providers/types.ts` | Types replaced by ai-enricher types |
| `scripts/api-providers/index.ts` | Barrel export no longer needed |
| `scripts/musicbrainz.ts` | Legacy wrapper, unused |
| `scripts/update-songs.ts` | Alternative CLI that used musicbrainz.ts |

## Files to Modify

| File | Changes |
|------|---------|
| `scripts/process-filelist.ts` | New 5-stage pipeline, remove API/consensus logic |
| `scripts/remote-scan/scan-and-upload.ps1` | Remove extension/sizeBytes/relativePath, filter .mp3 |
| `.github/workflows/update-songs.yml` | Remove cache/API-token steps, update env vars |
| `src/types/song.ts` | Update country field documentation |
| `src/utils/country-flags.ts` | New country code → flag/name mapping |
| `src/hooks/useFilter.ts` | Fixed country list instead of dynamic |

## Files to Create

| File | Purpose |
|------|---------|
| `scripts/ai-enricher.ts` | AI batch enrichment module (Claude + Gemini fallback) |

## Files Unchanged

| File | Why |
|------|-----|
| `scripts/filename-parser.ts` | Reused as-is for filename → artist/title parsing |
| `scripts/dedup.ts` | Reused as-is for deduplication + manual overrides |
| `data/manual-overrides.json` | Kept for manual corrections |
| `src/components/FilterChips/` | UI unchanged (already uses chips) |
| `scripts/remote-scan/scan-config.example.json` | Config template stays |
| `scripts/remote-scan/aktualizuj-liste.bat` | Launcher stays |
| `scripts/remote-scan/wymus-pelna-aktualizacje.bat` | Launcher stays |

## Risk Assessment

**Low risk**: Frontend changes are minimal (country-flags utility + useFilter hook). The chip UI component itself doesn't change.

**Medium risk**: Pipeline rewrite. Mitigated by reusing proven components (filename-parser, dedup) and keeping manual-overrides.

**Medium risk**: AI enrichment quality. Mitigated by the comparison report showing AI knowledge produces better year data than APIs. Batch processing introduces risk of individual errors — mitigated by spot-check validation in pipeline report.

**Low risk**: Scanner changes. Simple field removal and extension filter.

## Implementation Notes

- `process-filelist.ts` currently imports `Song` type from `./musicbrainz.js` — after deleting `musicbrainz.ts`, import `Song` from `../src/types/song.js` instead (or define inline)
- `scan-config.example.json` may need updating if it references `.mp3` in `fileExtensions`
- The `folder-scanner.ts` file (if it exists) may also reference the old `RawFileEntry` fields — check and update
- Existing `songs.json` data with ISO country codes (e.g., `"US"`, `"GB"`, `"SE"`) needs migration to new country values as part of the `--force` run
