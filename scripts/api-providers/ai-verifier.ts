/**
 * AI Verification Module
 *
 * Uses Claude or Gemini API to verify flagged entries from the multi-API
 * orchestrator. Called from GitHub Actions for entries that need manual review.
 *
 * Strategy:
 *   1. Collect all flagged entries from the orchestrator
 *   2. Batch them into groups (to minimize API calls)
 *   3. Send to AI with structured prompt asking for verification
 *   4. Parse AI response and apply corrections
 *
 * Setup:
 *   - Claude: Set ANTHROPIC_API_KEY as GitHub secret
 *   - Gemini: Set GEMINI_API_KEY as GitHub secret
 *
 * The AI is asked to:
 *   - Verify artist name spelling and canonical form
 *   - Verify song title accuracy
 *   - Resolve conflicts between API results
 *   - Flag entries it cannot verify (for true manual review)
 */

import https from 'node:https';
import type { ConsensusResult } from './types.js';

export interface AiVerificationResult {
  originalArtist: string;
  originalTitle: string;
  verifiedArtist: string;
  verifiedTitle: string;
  aiConfidence: 'high' | 'medium' | 'low' | 'unknown';
  aiNotes: string;
  stillFlagged: boolean;
}

interface AiConfig {
  provider: 'claude' | 'gemini';
  apiKey: string;
  batchSize: number;
  maxEntries: number;
}

/**
 * Verify flagged entries using AI.
 * Returns verification results for each entry.
 */
export async function verifyWithAi(
  flaggedEntries: ConsensusResult[],
  config?: Partial<AiConfig>,
): Promise<AiVerificationResult[]> {
  const aiConfig = resolveConfig(config);
  if (!aiConfig) {
    console.log('   [AI] No API key configured. Skipping AI verification.');
    return [];
  }

  console.log(`   [AI] Verifying ${Math.min(flaggedEntries.length, aiConfig.maxEntries)} flagged entries with ${aiConfig.provider}...`);

  const toVerify = flaggedEntries.slice(0, aiConfig.maxEntries);
  const results: AiVerificationResult[] = [];

  // Process in batches
  for (let i = 0; i < toVerify.length; i += aiConfig.batchSize) {
    const batch = toVerify.slice(i, i + aiConfig.batchSize);
    const batchResults = await verifyBatch(batch, aiConfig);
    results.push(...batchResults);

    if (i + aiConfig.batchSize < toVerify.length) {
      // Rate limit between batches
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  const verified = results.filter((r) => !r.stillFlagged).length;
  console.log(`   [AI] Verified: ${verified}/${results.length} entries resolved, ${results.length - verified} still flagged`);

  return results;
}

function resolveConfig(override?: Partial<AiConfig>): AiConfig | null {
  // Try Claude first, then Gemini
  const anthropicKey = process.env.ANTHROPIC_API_KEY || '';
  const geminiKey = process.env.GEMINI_API_KEY || '';

  if (anthropicKey) {
    return {
      provider: 'claude',
      apiKey: anthropicKey,
      batchSize: override?.batchSize ?? 25,
      maxEntries: override?.maxEntries ?? 200,
      ...override,
    };
  }

  if (geminiKey) {
    return {
      provider: 'gemini',
      apiKey: geminiKey,
      batchSize: override?.batchSize ?? 25,
      maxEntries: override?.maxEntries ?? 200,
      ...override,
    };
  }

  return null;
}

async function verifyBatch(
  entries: ConsensusResult[],
  config: AiConfig,
): Promise<AiVerificationResult[]> {
  const prompt = buildPrompt(entries);

  try {
    const response = config.provider === 'claude'
      ? await callClaude(prompt, config.apiKey)
      : await callGemini(prompt, config.apiKey);

    return parseAiResponse(entries, response);
  } catch (error) {
    console.warn(`   [AI] Batch verification failed: ${error instanceof Error ? error.message : error}`);
    // Return all entries as still flagged
    return entries.map((entry) => ({
      originalArtist: entry.artist,
      originalTitle: entry.title,
      verifiedArtist: entry.artist,
      verifiedTitle: entry.title,
      aiConfidence: 'unknown' as const,
      aiNotes: `AI verification failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      stillFlagged: true,
    }));
  }
}

function buildPrompt(entries: ConsensusResult[]): string {
  const entriesJson = entries.map((e, i) => ({
    index: i,
    currentArtist: e.artist,
    currentTitle: e.title,
    flagReasons: e.flagReasons,
    apiResults: e.providerResults.map((pr) => ({
      source: pr.provider,
      artist: pr.match?.artist || null,
      title: pr.match?.title || null,
      confidence: pr.match?.confidence || 0,
    })),
  }));

  return `You are a music metadata verification assistant. Below is a list of songs from a karaoke song database that have been flagged for review because multiple music APIs returned conflicting information or low confidence matches.

For each entry, determine the correct canonical artist name and song title. Consider:
- Common spelling variants (e.g., "2 Plus 1" vs "2+1" — the correct form is "2 plus 1")
- Polish vs English naming (this is a Polish karaoke business, so Polish artists should use Polish naming)
- The most commonly recognized form of the artist name
- Which API result is most likely correct based on confidence scores

Respond with a JSON array where each element has:
- "index": the entry index
- "artist": the correct canonical artist name
- "title": the correct canonical song title
- "confidence": "high", "medium", or "low"
- "notes": brief explanation of your decision (especially if you changed something)
- "needsManualReview": true if you're not confident and a human should check

ENTRIES:
${JSON.stringify(entriesJson, null, 2)}

Respond ONLY with the JSON array, no other text.`;
}

async function callClaude(prompt: string, apiKey: string): Promise<string> {
  const body = JSON.stringify({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Claude API error ${res.statusCode}: ${data.substring(0, 300)}`));
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const text = parsed.content?.[0]?.text || '';
            resolve(text);
          } catch {
            reject(new Error('Failed to parse Claude response'));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Claude API timeout'));
    });
    req.write(body);
    req.end();
  });
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
  });

  const path = `/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        path,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`Gemini API error ${res.statusCode}: ${data.substring(0, 300)}`));
            return;
          }
          try {
            const parsed = JSON.parse(data);
            const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text || '';
            resolve(text);
          } catch {
            reject(new Error('Failed to parse Gemini response'));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(60000, () => {
      req.destroy();
      reject(new Error('Gemini API timeout'));
    });
    req.write(body);
    req.end();
  });
}

function parseAiResponse(
  entries: ConsensusResult[],
  response: string,
): AiVerificationResult[] {
  try {
    // Extract JSON from response (AI might wrap it in markdown code blocks)
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('No JSON array found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      index: number;
      artist: string;
      title: string;
      confidence: string;
      notes: string;
      needsManualReview: boolean;
    }>;

    return parsed.map((item) => {
      const entry = entries[item.index];
      return {
        originalArtist: entry?.artist || '',
        originalTitle: entry?.title || '',
        verifiedArtist: item.artist || entry?.artist || '',
        verifiedTitle: item.title || entry?.title || '',
        aiConfidence: (['high', 'medium', 'low'].includes(item.confidence)
          ? item.confidence
          : 'unknown') as 'high' | 'medium' | 'low' | 'unknown',
        aiNotes: item.notes || '',
        stillFlagged: item.needsManualReview ?? false,
      };
    });
  } catch (error) {
    console.warn(`   [AI] Failed to parse AI response: ${error instanceof Error ? error.message : error}`);
    return entries.map((entry) => ({
      originalArtist: entry.artist,
      originalTitle: entry.title,
      verifiedArtist: entry.artist,
      verifiedTitle: entry.title,
      aiConfidence: 'unknown' as const,
      aiNotes: 'Failed to parse AI response',
      stillFlagged: true,
    }));
  }
}
