/**
 * Multi-API Orchestrator
 *
 * Queries multiple music metadata APIs in parallel, then uses consensus-based
 * merging to produce the most reliable result. Flags entries that need manual
 * review when APIs disagree or confidence is low.
 *
 * Resilience:
 *   - Each provider is wrapped in try/catch — a failing provider never crashes the pipeline
 *   - Auth errors (401/403) immediately disable the provider for the rest of the run
 *   - After 5 consecutive errors, a provider is auto-disabled
 *   - Provider health is tracked and reported in the pipeline report
 *   - The pipeline continues with whatever providers are still active
 */

import type {
  MusicApiProvider,
  ApiMatch,
  ApiProviderResult,
  ConsensusResult,
  OrchestratorConfig,
  ProviderHealth,
} from './types.js';
import { FlagReason } from './types.js';

/** Max consecutive errors before auto-disabling a provider */
const MAX_CONSECUTIVE_ERRORS = 5;
/** Patterns in error messages that indicate an auth/token problem */
const AUTH_ERROR_PATTERNS = ['HTTP 401', 'HTTP 403', 'Unauthorized', 'Forbidden', 'invalid key', 'Invalid API key', 'Invalid API Key', 'invalid_api_key'];

const DEFAULT_CONFIG: OrchestratorConfig = {
  providers: [],
  singleProviderMinConfidence: 80,
  consensusMinConfidence: 60,
  maxStringDistance: 0.3,
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
  /** Per-provider health tracking */
  private healthMap: Map<string, ProviderHealth> = new Map();

  constructor(config: Partial<OrchestratorConfig> & { providers: MusicApiProvider[] }) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    for (const p of this.config.providers) {
      this.healthMap.set(p.name, {
        name: p.name,
        status: 'active',
        totalRequests: 0,
        successCount: 0,
        errorCount: 0,
        consecutiveErrors: 0,
      });
    }
  }

  async init(): Promise<void> {
    for (const provider of this.config.providers) {
      try {
        if (provider.init) await provider.init();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error(`   ⚠️  [${provider.name}] INIT FAILED: ${msg} — provider disabled`);
        this.disableProvider(provider.name, 'disabled-errors', `Init failed: ${msg}`);
      }
    }
  }

  async saveCaches(): Promise<void> {
    for (const provider of this.config.providers) {
      if (!this.isProviderActive(provider.name)) continue;
      try {
        if (provider.saveCache) await provider.saveCache();
      } catch (error) {
        // Cache save failure is non-critical
        console.warn(`   [${provider.name}] Cache save failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  }

  /**
   * Search all providers for a single song and build consensus.
   */
  async resolve(artist: string, title: string): Promise<ConsensusResult> {
    this.stats.total++;

    // Only query active providers
    const activeProviders = this.config.providers.filter((p) => this.isProviderActive(p.name));

    // Query all active providers in parallel with timeout
    const providerResults = await Promise.all(
      activeProviders.map((provider) => this.queryProvider(provider, artist, title)),
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
   * Query a single provider with timeout and health tracking.
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
          setTimeout(() => reject(new Error('Timeout (30s)')), 30000),
        ),
      ]);
      this.recordSuccess(provider.name);
      return {
        provider: provider.name,
        match,
        elapsed: Date.now() - start,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.recordError(provider.name, errorMsg);
      return {
        provider: provider.name,
        match: null,
        elapsed: Date.now() - start,
        error: errorMsg,
      };
    }
  }

  // --- Health tracking ---

  private disableProvider(name: string, status: ProviderHealth['status'], reason: string): void {
    const h = this.healthMap.get(name);
    if (h && h.status === 'active') {
      h.status = status;
      h.reason = reason;
    }
  }

  private isProviderActive(name: string): boolean {
    return this.healthMap.get(name)?.status === 'active';
  }

  private recordSuccess(name: string): void {
    const h = this.healthMap.get(name);
    if (h) {
      h.totalRequests++;
      h.successCount++;
      h.consecutiveErrors = 0;
    }
  }

  private recordError(name: string, errorMessage: string): void {
    const h = this.healthMap.get(name);
    if (!h) return;
    h.totalRequests++;
    h.errorCount++;
    h.consecutiveErrors++;

    const isAuthError = AUTH_ERROR_PATTERNS.some((pat) => errorMessage.includes(pat));
    if (isAuthError) {
      console.error(`   ⚠️  [${name}] AUTH ERROR: ${errorMessage}`);
      console.error(`   ⚠️  [${name}] Provider disabled — check your API token/key!`);
      this.disableProvider(name, 'disabled-auth', errorMessage);
      return;
    }

    if (h.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.error(`   ⚠️  [${name}] ${MAX_CONSECUTIVE_ERRORS} consecutive errors — provider auto-disabled`);
      this.disableProvider(name, 'disabled-errors', `${MAX_CONSECUTIVE_ERRORS} consecutive errors. Last: ${errorMessage}`);
    }
  }

  // --- Public getters ---

  getFlaggedEntries(): ConsensusResult[] {
    return this.flaggedEntries;
  }

  getStats(): typeof this.stats {
    return { ...this.stats };
  }

  /**
   * Get health status of all providers.
   */
  getProviderHealth(): ProviderHealth[] {
    return Array.from(this.healthMap.values());
  }

  /**
   * Check if any provider had auth/token issues (for workflow-level reporting).
   */
  hasAuthErrors(): boolean {
    return Array.from(this.healthMap.values()).some((h) => h.status === 'disabled-auth');
  }

  // --- Consensus building (unchanged logic) ---

  private buildConsensus(
    originalArtist: string,
    originalTitle: string,
    results: ApiProviderResult[],
  ): ConsensusResult {
    const matches = results.filter((r) => r.match !== null).map((r) => r.match!);
    const flagReasons: string[] = [];

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

    if (matches.length === 1) {
      this.stats.singleMatch++;
      const match = matches[0];
      const flagged = match.confidence < this.config.singleProviderMinConfidence;
      if (flagged) flagReasons.push(FlagReason.LOW_CONFIDENCE);

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

    // Multiple matches — build consensus
    this.stats.consensus++;

    const artistNames = matches.map((m) => m.artist);
    const artistAgreement = this.calculateAgreement(artistNames);
    const titles = matches.map((m) => m.title);
    const titleAgreement = this.calculateAgreement(titles);

    if (!artistAgreement.consensus) flagReasons.push(FlagReason.ARTIST_MISMATCH);
    if (!titleAgreement.consensus) flagReasons.push(FlagReason.TITLE_MISMATCH);

    const bestArtist = artistAgreement.consensus
      ? artistAgreement.bestValue
      : this.pickBestByConfidence(matches, 'artist');

    const bestTitle = titleAgreement.consensus
      ? titleAgreement.bestValue
      : this.pickBestByConfidence(matches, 'title');

    const years = matches.map((m) => m.year).filter((y): y is number => y !== undefined && y > 1900);
    const bestYear = years.length > 0 ? Math.min(...years) : undefined;

    const countryMatch = matches.find((m) => m.source === 'musicbrainz' && m.country)
      || matches.find((m) => m.country);
    const bestCountry = countryMatch?.country;

    const allGenres = new Set<string>();
    for (const m of matches) {
      if (m.genres) m.genres.forEach((g) => allGenres.add(g));
    }

    const avgConfidence = matches.reduce((sum, m) => sum + m.confidence, 0) / matches.length;
    const agreementBonus = (artistAgreement.consensus ? 10 : -10) + (titleAgreement.consensus ? 10 : -10);
    const confidence = Math.min(100, Math.max(0, Math.round(avgConfidence + agreementBonus)));

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

  private calculateAgreement(values: string[]): { consensus: boolean; bestValue: string } {
    if (values.length === 0) return { consensus: false, bestValue: '' };
    if (values.length === 1) return { consensus: true, bestValue: values[0] };

    const normalized = values.map((v) => this.normalizeForComparison(v));
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

    const sorted = Array.from(counts.entries()).sort((a, b) => b[1].count - a[1].count);
    const topCount = sorted[0][1].count;
    return { consensus: topCount >= Math.ceil(values.length / 2), bestValue: sorted[0][1].original };
  }

  private pickBestByConfidence(matches: ApiMatch[], field: 'artist' | 'title'): string {
    const best = matches.reduce((a, b) => (a.confidence >= b.confidence ? a : b));
    return best[field];
  }

  private isSignificantChange(original: string, normalized: string): boolean {
    const a = this.normalizeForComparison(original);
    const b = this.normalizeForComparison(normalized);
    if (a === b) return false;
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

  private normalizeForComparison(s: string): string {
    return s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
