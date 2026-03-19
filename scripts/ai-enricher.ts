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

const SYSTEM_PROMPT = `You are a music metadata expert specializing in karaoke song databases.
You will receive a JSON array of songs with approximate artist/title from filenames.
Return a JSON array of the same length with enriched metadata.

RESPONSE FORMAT:
- Return ONLY a valid JSON array, no markdown, no explanation, no extra text.
- Each element must have exactly 4 fields: "artist", "title", "year", "country".
- The output array MUST have the same length and order as the input array.

FIELDS:

1. "artist" (string): Canonical artist/band name.
   - Fix typos and normalize spelling: "ACDC" → "AC/DC", "2 plus 1" → "2+1", "Goombay dance band" → "Goombay Dance Band"
   - Use the most widely recognized form: "Freddie Mercury" not "Farrokh Bulsara"
   - For "feat." collaborations, keep both artists: "Beyoncé feat. Jay-Z"
   - For bands/duos, keep the full name: "Simon & Garfunkel" stays as is

2. "title" (string): Canonical song title.
   - Fix casing and punctuation: "dont stop believin" → "Don't Stop Believin'"
   - Remove karaoke/version suffixes that may remain: "(Karaoke Version)", "[Instrumental]"
   - Keep meaningful parenthetical content: "Bohemian Rhapsody" stays, "Is This Love (Bob Marley)" → "Is This Love"
   - Use original language title: Polish songs keep Polish titles, Swedish songs keep Swedish titles

3. "year" (integer or null): Original FIRST release year.
   - This is the year the song was FIRST published/released as a single or on an album.
   - NOT a remaster year, NOT a compilation year, NOT a re-release year.
   - "Let It Be" by Beatles = 1970 (original), NOT 2003 (remaster)
   - "Dziwny jest ten świat" by Czesław Niemen = 1967, NOT any later re-release
   - If uncertain, return null. Never guess.

4. "country" (string or null): Artist's country of origin. Use ONLY these exact values:
   "PL" — Poland (e.g. Budka Suflera, Doda, Kayah, Maryla Rodowicz)
   "EN" — English-speaking countries: UK, Ireland, USA, Canada, Australia, New Zealand, Jamaica, South Africa, Malta (e.g. Beatles, Elvis, Adele, Bob Marley, AC/DC)
   "Sweden" — Sweden (e.g. ABBA, Roxette, Robyn)
   "Norway" — Norway (e.g. a-ha, Sigrid)
   "Spain" — Spain (e.g. Julio Iglesias, Enrique Iglesias)
   "Italy" — Italy (e.g. Eros Ramazzotti, Laura Pausini, Adriano Celentano)
   "Germany" — Germany, Austria, German-speaking Switzerland (e.g. Nena, Rammstein, Falco)
   null — any other country or unknown (e.g. Édith Piaf → null, Celine Dion → null)

   EDGE CASES for country:
   - Polish artist singing in English → still "PL" (it's about the artist, not the language)
   - Band formed in one country with members from multiple countries → use the country where the band was formed
   - Solo artist who moved countries → use birth/origin country
   - If genuinely unknown, return null

EXAMPLES:

Input: [{"artist":"beatles","title":"help"}]
Output: [{"artist":"The Beatles","title":"Help!","year":1965,"country":"EN"}]

Input: [{"artist":"budka suflera","title":"takie tango"}]
Output: [{"artist":"Budka Suflera","title":"Takie tango","year":1980,"country":"PL"}]

Input: [{"artist":"ABBA","title":"waterloo"}]
Output: [{"artist":"ABBA","title":"Waterloo","year":1974,"country":"Sweden"}]

Input: [{"artist":"edith piaf","title":"la vie en rose"}]
Output: [{"artist":"Édith Piaf","title":"La Vie en rose","year":1947,"country":null}]

Input: [{"artist":"Boney M","title":"rasputin"}]
Output: [{"artist":"Boney M.","title":"Rasputin","year":1978,"country":"Germany"}]

Input: [{"artist":"ich troje","title":"powiedz"}]
Output: [{"artist":"Ich Troje","title":"Powiedz","year":2003,"country":"PL"}]

Input: [{"artist":"a-ha","title":"take on me"}]
Output: [{"artist":"a-ha","title":"Take On Me","year":1985,"country":"Norway"}]`;

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
