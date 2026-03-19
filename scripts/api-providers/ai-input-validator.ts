/**
 * AI Input Pre-Validation
 *
 * Validates and corrects parsed filename data BEFORE sending to music APIs.
 * This ensures APIs receive the best possible query data, leading to
 * higher quality results.
 *
 * Catches:
 *   - Typos in artist names (e.g. "Elton Johm" → "Elton John")
 *   - Swapped artist/title (e.g. "Been Caught Stealing — Jane's Addiction")
 *   - Malformed names (e.g. "GunsNRoses" → "Guns N' Roses")
 *   - Discogs disambiguation artifacts (trailing asterisks)
 *   - Polish/non-ASCII character issues
 */

import https from 'node:https';
import type { ParsedSong } from '../filename-parser.js';

export interface InputValidationResult {
  original: ParsedSong;
  corrected: ParsedSong;
  wasChanged: boolean;
  notes: string;
}

interface AiConfig {
  provider: 'claude' | 'gemini';
  apiKey: string;
}

/**
 * Pre-validate parsed filename data using AI.
 * Returns corrected entries ready for API lookup.
 */
export async function preValidateInputs(
  entries: ParsedSong[],
): Promise<InputValidationResult[]> {
  const configs = resolveConfigs();
  if (configs.length === 0) {
    console.log('   [AI Pre-validation] No API key configured. Skipping.');
    return entries.map((e) => ({ original: e, corrected: e, wasChanged: false, notes: '' }));
  }

  const config = configs[0];
  const fallback = configs.length > 1 ? configs[1] : null;
  const batchSize = 50;
  const results: InputValidationResult[] = [];

  console.log(`   [AI Pre-validation] Checking ${entries.length} entries with ${config.provider}...`);

  for (let i = 0; i < entries.length; i += batchSize) {
    const batch = entries.slice(i, i + batchSize);
    const batchResults = await validateBatch(batch, config, fallback);
    results.push(...batchResults);

    if (i + batchSize < entries.length) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  const changed = results.filter((r) => r.wasChanged).length;
  console.log(`   [AI Pre-validation] ${changed} corrections applied out of ${entries.length} entries`);

  return results;
}

function resolveConfigs(): AiConfig[] {
  const configs: AiConfig[] = [];
  if (process.env.ANTHROPIC_API_KEY) {
    configs.push({ provider: 'claude', apiKey: process.env.ANTHROPIC_API_KEY });
  }
  if (process.env.GEMINI_API_KEY) {
    configs.push({ provider: 'gemini', apiKey: process.env.GEMINI_API_KEY });
  }
  return configs;
}

async function validateBatch(
  entries: ParsedSong[],
  primary: AiConfig,
  fallback: AiConfig | null,
): Promise<InputValidationResult[]> {
  const prompt = buildPreValidationPrompt(entries);

  try {
    const response = await callProvider(prompt, primary);
    return parsePreValidationResponse(entries, response);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`   [AI Pre-validation] ${primary.provider} failed: ${detail}`);

    if (fallback) {
      try {
        const response = await callProvider(prompt, fallback);
        return parsePreValidationResponse(entries, response);
      } catch (fbError) {
        const fbDetail = fbError instanceof Error ? fbError.message : String(fbError);
        console.warn(`   [AI Pre-validation] ${fallback.provider} also failed: ${fbDetail}`);
      }
    }

    // Both failed — return entries unchanged
    return entries.map((e) => ({ original: e, corrected: e, wasChanged: false, notes: 'AI unavailable' }));
  }
}

function buildPreValidationPrompt(entries: ParsedSong[]): string {
  const data = entries.map((e, i) => ({
    index: i,
    filename: e.filename,
    artist: e.artist,
    title: e.title,
  }));

  return `You are a music metadata expert. Below are artist/title pairs parsed from karaoke filenames.

Check each entry for these issues and correct them:

1. **Typos in artist names**: "Elton Johm" → "Elton John", "Beyonve" → "Beyoncé"
2. **Swapped artist/title**: If the artist field contains a song title and vice versa, swap them
3. **Malformed names**: "GunsNRoses" → "Guns N' Roses", "ACDC" → "AC/DC"
4. **Disambiguation artifacts**: Remove trailing asterisks (Discogs uses them, e.g. "Ania*" → "Ania")
5. **Missing diacritics for Polish names**: "Goralka" → "Góralka" if it's a known Polish artist
6. **Bracket conventions**: Keep [Disney], [theatre], [traditional] as-is — these are valid category labels

RULES:
- Only correct entries that have CLEAR errors. Do not "improve" correct data.
- If an entry looks correct, mark action as "ok" with no changes.
- For artist names, use the most widely recognized spelling.
- Keep the title as close to the filename as possible (don't add subtitle info from memory).

Respond with a JSON array:
- "index": entry index
- "action": "ok" (no change needed) or "corrected" (fixed something)
- "artist": corrected artist (or same if ok)
- "title": corrected title (or same if ok)
- "notes": what was wrong (only if corrected, empty string if ok)

ENTRIES:
${JSON.stringify(data, null, 2)}

Respond ONLY with the JSON array.`;
}

function parsePreValidationResponse(
  entries: ParsedSong[],
  response: string,
): InputValidationResult[] {
  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('No JSON array found');

    const parsed = JSON.parse(jsonMatch[0]) as Array<Record<string, unknown>>;
    const results: InputValidationResult[] = [];

    for (const item of parsed) {
      const index = typeof item.index === 'number' ? item.index : -1;
      if (index < 0 || index >= entries.length) continue;

      const original = entries[index];
      const action = typeof item.action === 'string' ? item.action.toLowerCase() : 'ok';
      const artist = typeof item.artist === 'string' ? item.artist : original.artist;
      const title = typeof item.title === 'string' ? item.title : original.title;
      const notes = typeof item.notes === 'string' ? item.notes : '';

      const wasChanged = action === 'corrected' &&
        (artist !== original.artist || title !== original.title);

      results.push({
        original,
        corrected: wasChanged
          ? { filename: original.filename, artist, title }
          : original,
        wasChanged,
        notes: wasChanged ? notes : '',
      });
    }

    // Fill in any entries the AI missed
    for (let i = 0; i < entries.length; i++) {
      if (!results.some((r) => r.original === entries[i])) {
        results.push({
          original: entries[i],
          corrected: entries[i],
          wasChanged: false,
          notes: '',
        });
      }
    }

    return results;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.warn(`   [AI Pre-validation] Parse error: ${detail}`);
    return entries.map((e) => ({ original: e, corrected: e, wasChanged: false, notes: 'Parse failed' }));
  }
}

async function callProvider(prompt: string, config: AiConfig): Promise<string> {
  return config.provider === 'claude'
    ? callClaude(prompt, config.apiKey)
    : callGemini(prompt, config.apiKey);
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
            resolve(parsed.content?.[0]?.text || '');
          } catch {
            reject(new Error('Failed to parse Claude response'));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}

async function callGemini(prompt: string, apiKey: string): Promise<string> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'generativelanguage.googleapis.com',
        path: `/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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
            resolve(parsed.candidates?.[0]?.content?.parts?.[0]?.text || '');
          } catch {
            reject(new Error('Failed to parse Gemini response'));
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(body);
    req.end();
  });
}
