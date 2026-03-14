/**
 * Multi-API Verification Service — factory + re-exported helpers.
 *
 * Usage in process-filelist.ts:
 *
 *   import { createOrchestrator, verifyWithAi } from './api-providers/index.js';
 *   import type { ConsensusResult, ProviderHealth } from './api-providers/types.js';
 *
 *   const orchestrator = await createOrchestrator();
 *   const result = await orchestrator.resolve(artist, title);
 */

import { MultiApiOrchestrator } from './orchestrator.js';
import { MusicBrainzProvider } from './musicbrainz-provider.js';
import { DiscogsProvider } from './discogs.js';
import { LastfmProvider } from './lastfm.js';
import type { MusicApiProvider } from './types.js';

// Re-export only what process-filelist.ts actually needs from here
export { verifyWithAi } from './ai-verifier.js';

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
