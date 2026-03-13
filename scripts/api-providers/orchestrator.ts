/**
 * Multi-API Orchestrator
 *
 * Queries multiple music metadata APIs in parallel, then uses consensus-based
 * merging to produce the most reliable result. Flags entries that need manual
 * review when APIs disagree or confidence is low.
 *
 * Strategy:
 *   1. Send search query to all providers simultaneously
 *   2. Collect results (with timeouts — don't wait for slow/failing APIs)
 *   3. Compare results across providers
 *   4. Build consensus: pick artist/title that most APIs agree on
 *   5. Flag entries where:
 *      - No API returned a match
 *      - APIs disagree on artist/title
 *      - Only one API matched with low confidence
 *      - Significant normalization happened
 */

import type {
  MusicApiProvider,
  ApiMatch,
  ApiProviderResult,
  ConsensusResult,
  OrchestratorConfig,
} from './types.js';
import { FlagReason } from './types.js';

const DEFAULT_CONFIG: OrchestratorConfig = {
  providers: [],
  singleProviderMinConfidence: 80,
  consensusMinConfidence: 60,
  maxStringDistance: 0.3, // 30% distance allowed
  aiVerification: false,
};

export class MultiApiOrchestrator {
  private config: OrchestratorConfig;
  private flaggedEntries: ConsensusResult[] = [];
  private stats = {
    total: 0,
    consensus: 0,
    singleMatch: 0,
    noMatch: 0,
    flagged: 0,
  };

  constructor(config: Partial<OrchestratorConfig> & { providers: MusicApiProvider[] }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async init(): Promise<void> {
    for (const provider of this.config.providers) {
      if (provider.init) await provider.init();
    }
  }

  async saveCaches(): Promise<void> {
    for (const provider of this.config.providers) {
      if (provider.saveCache) await provider.saveCache();
    }
  }

  /**
   * Search all providers for a single song and build consensus.
   */
  async resolve(artist: string, title: string): Promise<ConsensusResult> {
    this.stats.total++;

    // Query all providers in parallel with timeout
    const providerResults = await Promise.all(
      this.config.providers.map((provider) => this.queryProvider(provider, artist, title)),
    );

    // Build consensus from results
    const consensus = this.buildConsensus(artist, title, providerResults);

    if (consensus.flagged) {
      this.flaggedEntries.push(consensus);
      this.stats.flagged++;
    }

    return consensus;
  }

  /**
   * Query a single provider with timeout handling.
   */
  private async queryProvider(
    provider: MusicApiProvider,
    artist: string,
    title: string,
  ): Promise<ApiProviderResult> {
    const start = Date.now();
    try {
      const match = await Promise.race([
        provider.search(artist, title),
        new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout')), 30000),
        ),
      ]);
      return {
        provider: provider.name,
        match,
        elapsed: Date.now() - start,
      };
    } catch (error) {
      return {
        provider: provider.name,
        match: null,
        elapsed: Date.now() - start,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Build consensus from multiple API results.
   */
  private buildConsensus(
    originalArtist: string,
    originalTitle: string,
    results: ApiProviderResult[],
  ): ConsensusResult {
    const matches = results.filter((r) => r.match !== null).map((r) => r.match!);
    const flagReasons: string[] = [];

    // Case 1: No matches from any API
    if (matches.length === 0) {
      this.stats.noMatch++;
      return {
        artist: originalArtist,
        title: originalTitle,
        confidence: 0,
        sources: [],
        flagged: true,
        flagReasons: [FlagReason.NO_MATCH],
        providerResults: results,
      };
    }

    // Case 2: Single match
    if (matches.length === 1) {
      this.stats.singleMatch++;
      const match = matches[0];
      const flagged = match.confidence < this.config.singleProviderMinConfidence;
      if (flagged) flagReasons.push(FlagReason.LOW_CONFIDENCE);

      // Check for significant normalization
      if (this.isSignificantChange(originalArtist, match.artist)) {
        flagReasons.push(FlagReason.MAJOR_NORMALIZATION);
      }

      return {
        artist: match.confidence >= this.config.singleProviderMinConfidence ? match.artist : originalArtist,
        title: match.confidence >= this.config.singleProviderMinConfidence ? match.title : originalTitle,
        confidence: match.confidence,
        year: match.year,
        country: match.country,
        genres: match.genres,
        sources: [match.source],
        flagged: flagReasons.length > 0,
        flagReasons,
        providerResults: results,
      };
    }

    // Case 3: Multiple matches — build consensus
    this.stats.consensus++;

    // Check if APIs agree on artist name
    const artistNames = matches.map((m) => m.artist);
    const artistAgreement = this.calculateAgreement(artistNames);

    // Check if APIs agree on title
    const titles = matches.map((m) => m.title);
    const titleAgreement = this.calculateAgreement(titles);

    // Flag disagreements
    if (!artistAgreement.consensus) {
      flagReasons.push(FlagReason.ARTIST_MISMATCH);
    }
    if (!titleAgreement.consensus) {
      flagReasons.push(FlagReason.TITLE_MISMATCH);
    }

    // Pick the best artist: prefer the name most APIs agree on,
    // weighted by confidence scores
    const bestArtist = artistAgreement.consensus
      ? artistAgreement.bestValue
      : this.pickBestByConfidence(matches, 'artist');

    const bestTitle = titleAgreement.consensus
      ? titleAgreement.bestValue
      : this.pickBestByConfidence(matches, 'title');

    // Year: prefer earliest plausible year
    const years = matches.map((m) => m.year).filter((y): y is number => y !== undefined && y > 1900);
    const bestYear = years.length > 0 ? Math.min(...years) : undefined;

    // Country: prefer MusicBrainz (most reliable for artist origin)
    const countryMatch = matches.find((m) => m.source === 'musicbrainz' && m.country)
      || matches.find((m) => m.country);
    const bestCountry = countryMatch?.country;

    // Genres: merge all unique
    const allGenres = new Set<string>();
    for (const m of matches) {
      if (m.genres) m.genres.forEach((g) => allGenres.add(g));
    }

    // Combined confidence: average of all matches, boosted if they agree
    const avgConfidence = matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length;
    const agreementBonus = (artistAgreement.consensus ? 10 : -10) + (titleAgreement.consensus ? 10 : -10);
    const confidence = Math.min(100, Math.max(0, Math.round(avgConfidence + agreementBonus)));

    // Check for significant normalization from original
    if (this.isSignificantChange(originalArtist, bestArtist)) {
      flagReasons.push(FlagReason.MAJOR_NORMALIZATION);
    }

    return {
      artist: bestArtist,
      title: bestTitle,
      confidence,
      year: bestYear,
      country: bestCountry,
      genres: allGenres.size > 0 ? Array.from(allGenres) : undefined,
      sources: matches.map((m) => m.source),
      flagged: flagReasons.length > 0,
      flagReasons,
      providerResults: results,
    };
  }

  /**
   * Check if multiple strings roughly agree (allowing for minor differences).
   */
  private calculateAgreement(values: string[]): { consensus: boolean; bestValue: string } {
    if (values.length === 0) return { consensus: false, bestValue: '' };
    if (values.length === 1) return { consensus: true, bestValue: values[0] };

    // Normalize for comparison
    const normalized = values.map((v) => this.normalizeForComparison(v));

    // Count occurrences of each normalized form
    const counts = new Map<string, { count: number; original: string }>();
    for (let i = 0; i < normalized.length; i++) {
      const key = normalized[i];
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
      } else {
        counts.set(key, { count: 1, original: values[i] });
      }
    }

    // Check if most values agree (allowing fuzzy match)
    const sorted = Array.from(counts.entries()).sort((a, b) => b[1].count - a[1].count);
    const topCount = sorted[0][1].count;
    const consensus = topCount >= Math.ceil(values.length / 2);

    return { consensus, bestValue: sorted[0][1].original };
  }

  /**
   * Pick the best value from matches, weighted by confidence.
   */
  private pickBestByConfidence(matches: ApiMatch[], field: 'artist' | 'title'): string {
    const best = matches.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
    return best[field];
  }

  /**
   * Check if the change from original is significant enough to flag.
   */
  private isSignificantChange(original: string, normalized: string): boolean {
    const a = this.normalizeForComparison(original);
    const b = this.normalizeForComparison(normalized);
    if (a === b) return false;

    // Calculate Levenshtein-like distance ratio
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return false;

    let distance = 0;
    const minLen = Math.min(a.length, b.length);
    for (let i = 0; i < minLen; i++) {
      if (a[i] !== b[i]) distance++;
    }
    distance += Math.abs(a.length - b.length);

    return distance / maxLen > this.config.maxStringDistance;
  }

  /**
   * Normalize a string for comparison (lowercase, strip diacritics, punctuation).
   */
  private normalizeForComparison(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Get all flagged entries for manual review.
   */
  getFlaggedEntries(): ConsensusResult[] {
    return this.flaggedEntries;
  }

  /**
   * Get pipeline statistics.
   */
  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Generate a flagged entries report as markdown.
   */
  generateFlagReport(): string {
    let md = '## Flagged Entries for Manual Review\n\n';
    md += `Total flagged: ${this.flaggedEntries.length}\n\n`;

    // Group by flag reason
    const byReason = new Map<string, ConsensusResult[]>();
    for (const entry of this.flaggedEntries) {
      for (const reason of entry.flagReasons) {
        if (!byReason.has(reason)) byReason.set(reason, []);
        byReason.get(reason)!.push(entry);
      }
    }

    for (const [reason, entries] of byReason) {
      md += `### ${reason} (${entries.length})\n\n`;
      for (const entry of entries.slice(0, 20)) {
        md += `- **${entry.artist} — ${entry.title}** (confidence: ${entry.confidence})\n`;
        for (const pr of entry.providerResults) {
          if (pr.match) {
            md += `  - ${pr.provider}: "${pr.match.artist} — ${pr.match.title}" (${pr.match.confidence}%)\n`;
          } else {
            md += `  - ${pr.provider}: no match${pr.error ? ` (${pr.error})` : ''}\n`;
          }
        }
        md += '\n';
      }
      if (entries.length > 20) {
        md += `*... and ${entries.length - 20} more*\n\n`;
      }
    }

    return md;
  }
}
