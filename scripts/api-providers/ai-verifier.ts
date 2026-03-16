/**
 * AI Verification Module
 *
 * Uses Claude or Gemini API to verify entries from the multi-API orchestrator.
 * Called from GitHub Actions when API results don't 100% match the original
 * filename data, or when entries are flagged for review.
 *
 * The AI makes explicit accept/correct/reject decisions:
 *   - "accepted": API data is correct, use it as-is
 *   - "corrected": API data was partially wrong, AI provides corrections
 *   - "rejected": API returned completely wrong data, keep original filename data
 *
 * All decisions are documented in the pipeline report for audit.
 *
 * Setup:
 *   - Claude: Set ANTHROPIC_API_KEY as GitHub secret
 *   - Gemini: Set GEMINI_API_KEY as GitHub secret
 */

import https from 'node:https';
import type { ConsensusResult, AiDecision } from './types.js';

export interface AiVerificationResult {
  originalArtist: string;
  originalTitle: string;
  verifiedArtist: string;
  verifiedTitle: string;
  aiConfidence: 'high' | 'medium' | 'low' | 'unknown';
  aiNotes: string;
  stillFlagged: boolean;
  /** Structured decision for audit trail */
  decision?: AiDecision;
}

interface AiConfig {
  provider: 'claude' | 'gemini';
  apiKey: string;
  batchSize: number;
  maxEntries: number;
}

/**
 * Verify entries using AI.
 * Accepts both flagged entries and discrepancy entries (where API data
 * differs from original filename data).
 * Returns verification results with explicit decisions for each entry.
 */
export async function verifyWithAi(
  entries: ConsensusResult[],
  config?: Partial<AiConfig>,
): Promise<AiVerificationResult[]> {
  const aiConfig = resolveConfig(config);
  if (!aiConfig) {
    console.log('   [AI] No API key configured. Skipping AI verification.');
    return [];
  }

  console.log(`   [AI] Verifying ${Math.min(entries.length, aiConfig.maxEntries)} entries with ${aiConfig.provider}...`);

  const toVerify = entries.slice(0, aiConfig.maxEntries);
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

  const accepted = results.filter((r) => r.decision?.action === 'accepted').length;
  const corrected = results.filter((r) => r.decision?.action === 'corrected').length;
  const rejected = results.filter((r) => r.decision?.action === 'rejected').length;
  const needsReview = results.filter((r) => r.stillFlagged).length;
  console.log(`   [AI] Results: ${accepted} accepted, ${corrected} corrected, ${rejected} rejected, ${needsReview} still need manual review`);

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
      originalArtist: entry.originalInput?.artist || entry.artist,
      originalTitle: entry.originalInput?.title || entry.title,
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
    originalFilename: e.originalInput?.filename || 'unknown',
    originalArtist: e.originalInput?.artist || e.artist,
    originalTitle: e.originalInput?.title || e.title,
    currentArtist: e.artist,
    currentTitle: e.title,
    confidence: e.confidence,
    flagReasons: e.flagReasons.length > 0 ? e.flagReasons : ['discrepancy'],
    apiResults: e.providerResults.map((pr) => ({
      source: pr.provider,
      artist: pr.match?.artist || null,
      title: pr.match?.title || null,
      confidence: pr.match?.confidence || 0,
    })),
  }));

  return `You are a music metadata verification assistant for a Polish karaoke business.

Below is a list of songs where the API lookup results don't perfectly match the original filename data, or where multiple APIs returned conflicting information.

For each entry you have:
- "originalArtist" / "originalTitle": what was parsed from the karaoke file name (this is what the business owner expects)
- "currentArtist" / "currentTitle": what the API consensus engine chose
- "apiResults": individual results from each music API

YOUR TASK: For each entry, make one of these decisions:
1. "accepted" — the API data is correct and matches the song (even if spelling differs slightly, e.g. "AC/DC" vs "ACDC")
2. "corrected" — the API data is partially right but needs fixing (provide the correct artist/title)
3. "rejected" — the API returned data for a COMPLETELY DIFFERENT song (wrong artist AND/OR wrong title that doesn't match at all). In this case, keep the original filename data.

IMPORTANT RULES:
- If an API returns a completely different artist or song (e.g., searching for "The Doors - 13" but getting "8667 - 13"), that API result should be REJECTED
- Minor spelling/formatting differences are OK (e.g., "98°" vs "98 Degrees" — these are the same artist)
- Polish artists should use their commonly recognized Polish name
- When in doubt, prefer the original filename data over low-confidence API results
- Be especially suspicious of single-API matches with confidence < 80%

Respond with a JSON array where each element has:
- "index": the entry index
- "action": "accepted", "corrected", or "rejected"
- "artist": the final correct artist name
- "title": the final correct song title
- "confidence": "high", "medium", or "low"
- "notes": brief explanation of your decision (REQUIRED — explain why you accepted, corrected, or rejected)
- "needsManualReview": true only if you truly cannot determine the correct data

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
      action?: string;
      artist: string;
      title: string;
      confidence: string;
      notes: string;
      needsManualReview: boolean;
    }>;

    return parsed.map((item) => {
      const entry = entries[item.index];
      const originalArtist = entry?.originalInput?.artist || entry?.artist || '';
      const originalTitle = entry?.originalInput?.title || entry?.title || '';
      const action = (['accepted', 'corrected', 'rejected'].includes(item.action || '')
        ? item.action
        : 'accepted') as 'accepted' | 'corrected' | 'rejected';
      const confidence = (['high', 'medium', 'low'].includes(item.confidence)
        ? item.confidence
        : 'medium') as 'high' | 'medium' | 'low';

      // Determine final artist/title based on action
      let finalArtist: string;
      let finalTitle: string;
      if (action === 'rejected') {
        finalArtist = originalArtist;
        finalTitle = originalTitle;
      } else {
        finalArtist = item.artist || entry?.artist || '';
        finalTitle = item.title || entry?.title || '';
      }

      return {
        originalArtist,
        originalTitle,
        verifiedArtist: finalArtist,
        verifiedTitle: finalTitle,
        aiConfidence: confidence,
        aiNotes: item.notes || '',
        stillFlagged: item.needsManualReview ?? false,
        decision: {
          action,
          reason: item.notes || '',
          confidence,
          chosenArtist: finalArtist,
          chosenTitle: finalTitle,
        },
      };
    });
  } catch (error) {
    console.warn(`   [AI] Failed to parse AI response: ${error instanceof Error ? error.message : error}`);
    return entries.map((entry) => ({
      originalArtist: entry.originalInput?.artist || entry.artist,
      originalTitle: entry.originalInput?.title || entry.title,
      verifiedArtist: entry.artist,
      verifiedTitle: entry.title,
      aiConfidence: 'unknown' as const,
      aiNotes: 'Failed to parse AI response',
      stillFlagged: true,
    }));
  }
}
