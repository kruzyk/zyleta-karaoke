/**
 * Multi-API Verification Service — public API.
 *
 * Usage in process-filelist.ts:
 *
 *   import { createOrchestrator } from './api-providers/index.js';
 *
 *   const orchestrator = await createOrchestrator();
 *   const result = await orchestrator.resolve(artist, title);
 */

export { MultiApiOrchestrator } from './orchestrator.js';
export { MusicBrainzProvider } from './musicbrainz-provider.js';
export { DiscogsProvider } from './discogs.js';
export { LastfmProvider } from './lastfm.js';
export { verifyWithAi } from './ai-verifier.js';
export type {
  MusicApiProvider,
  ApiMatch,
  ApiProviderResult,
  ConsensusResult,
  OrchestratorConfig,
} from './types.js';
export { FlagReason } from './types.js';

import { MultiApiOrchestrator } from './orchestrator.js';
import { MusicBrainzProvider } from './musicbrainz-provider.js';
import { DiscogsProvider } from './discogs.js';
import { LastfmProvider } from './lastfm.js';
import type { MusicApiProvider } from './types.js';

/**
 * Create and initialize the orchestrator with all available providers.
 * Providers are enabled based on environment variables:
 *   - MusicBrainz: always enabled (no auth required)
 *   - Discogs: enabled when DISCOGS_TOKEN is set
 *   - Last.fm: enabled when LASTFM_API_KEY is set
 */
export async function createOrchestrator(): Promise<MultiApiOrchestrator> {
  const providers: MusicApiProvider[] = [];

  // MusicBrainz — always available (no auth required)
  providers.push(new MusicBrainzProvider());

  // Discogs — requires personal access token
  if (process.env.DISCOGS_TOKEN) {
    providers.push(new DiscogsProvider());
  } else {
    console.log('   [Config] Discogs disabled (set DISCOGS_TOKEN to enable)');
  }

  // Last.fm — requires free API key
  if (process.env.LASTFM_API_KEY) {
    providers.push(new LastfmProvider());
  } else {
    console.log('   [Config] Last.fm disabled (set LASTFM_API_KEY to enable)');
  }

  console.log(`   [Config] Active providers: ${providers.map((p) => p.name).join(', ')}`);

  const orchestrator = new MultiApiOrchestrator({
    providers,
    singleProviderMinConfidence: 80,
    consensusMinConfidence: 60,
    maxStringDistance: 0.3,
    aiVerification: !!(process.env.ANTHROPIC_API_KEY || process.env.GEMINI_API_KEY),
  });

  await orchestrator.init();
  return orchestrator;
}
