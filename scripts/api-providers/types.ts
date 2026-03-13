/**
 * Shared types for the multi-API verification service.
 *
 * Each API provider implements the MusicApiProvider interface.
 * The orchestrator queries all providers in parallel, then uses
 * consensus-based merging to produce the best result.
 */

export interface ApiMatch {
  /** Canonical artist name from this API */
  artist: string;
  /** Canonical track title from this API */
  title: string;
  /** Confidence score 0-100 */
  confidence: number;
  /** Year of first release (if available) */
  year?: number;
  /** Country code ISO 3166-1 (if available) */
  country?: string;
  /** Genre tags (if available) */
  genres?: string[];
  /** Source API name */
  source: string;
  /** Raw API response ID for debugging */
  sourceId?: string;
}

export interface ApiProviderResult {
  provider: string;
  match: ApiMatch | null;
  /** Time taken in ms */
  elapsed: number;
  error?: string;
}

export interface ConsensusResult {
  /** Final merged artist name */
  artist: string;
  /** Final merged title */
  title: string;
  /** Combined confidence (0-100) — higher when multiple APIs agree */
  confidence: number;
  /** Year from the most reliable source */
  year?: number;
  /** Country from the most reliable source */
  country?: string;
  /** Genres merged from all sources */
  genres?: string[];
  /** Which APIs contributed to this result */
  sources: string[];
  /** Whether this entry needs manual review */
  flagged: boolean;
  /** Reasons for flagging (if any) */
  flagReasons: string[];
  /** Individual API results for audit trail */
  providerResults: ApiProviderResult[];
}

/**
 * Flag reasons — used to determine what needs manual review.
 */
export enum FlagReason {
  /** No API returned a match */
  NO_MATCH = 'no-match',
  /** APIs disagree on artist name */
  ARTIST_MISMATCH = 'artist-mismatch',
  /** APIs disagree on title */
  TITLE_MISMATCH = 'title-mismatch',
  /** Only one API matched, low confidence */
  LOW_CONFIDENCE = 'low-confidence',
  /** Artist name was significantly normalized */
  MAJOR_NORMALIZATION = 'major-normalization',
  /** Potential duplicate with different metadata */
  POTENTIAL_DUPLICATE = 'potential-duplicate',
}

/**
 * Interface that each API provider must implement.
 */
export interface MusicApiProvider {
  /** Provider name (e.g. 'musicbrainz', 'discogs', 'reccobeats') */
  readonly name: string;

  /**
   * Search for a recording by artist + title.
   * Should return the best match or null if no good match found.
   */
  search(artist: string, title: string): Promise<ApiMatch | null>;

  /**
   * Initialize the provider (load cache, set up auth, etc.)
   */
  init?(): Promise<void>;

  /**
   * Flush caches to disk.
   */
  saveCache?(): Promise<void>;
}

/**
 * Configuration for the multi-API orchestrator.
 */
export interface OrchestratorConfig {
  /** Which providers to use */
  providers: MusicApiProvider[];
  /** Minimum confidence for a single-provider match to be accepted without flag */
  singleProviderMinConfidence: number;
  /** Minimum confidence for consensus (multiple providers agree) */
  consensusMinConfidence: number;
  /** Maximum string distance for artist/title to be considered "matching" across APIs */
  maxStringDistance: number;
  /** Enable AI verification for flagged entries */
  aiVerification: boolean;
}
