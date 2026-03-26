/**
 * Zod schemas for validating external data flowing into the pipeline.
 *
 * Covers:
 * - raw-filelist.json (scanned from karaoke laptop)
 * - songs.json (existing song database)
 * - manual-overrides.json (hand-curated corrections)
 * - AI enrichment API responses (Claude / Gemini)
 */
import { z } from 'zod';

// ── Shared enums ──

export const SongCountrySchema = z.enum([
  'PL',
  'EN',
  'Sweden',
  'Norway',
  'Spain',
  'Italy',
  'Germany',
]);

// ── raw-filelist.json ──

export const RawFileEntrySchema = z.object({
  filename: z.string(),
  sourceFolder: z.string().optional(),
});

export const RawFileListSchema = z.object({
  scannedAt: z.string(),
  folderPaths: z.array(z.string()),
  totalFiles: z.number().int().nonnegative(),
  files: z.array(RawFileEntrySchema),
});

export type RawFileList = z.infer<typeof RawFileListSchema>;
export type RawFileEntry = z.infer<typeof RawFileEntrySchema>;

// ── songs.json ──

export const SongSchema = z.object({
  id: z.string(),
  artist: z.string(),
  title: z.string(),
  country: SongCountrySchema.optional(),
  language: SongCountrySchema.optional(),
  year: z.number().int().optional(),
});

export const SongsArraySchema = z.array(SongSchema);

// ── manual-overrides.json ──

export const ManualOverrideSchema = z.object({
  artist: z.string().optional(),
  title: z.string().optional(),
  country: z.string().optional(),
  language: z.string().optional(),
  year: z.number().int().optional(),
});

/** Top-level: Record<songId, override>. Keys starting with _ are metadata (ignored). */
export const ManualOverridesSchema = z.record(
  z.string(),
  z.union([ManualOverrideSchema, z.string()]),
);

export type ManualOverride = z.infer<typeof ManualOverrideSchema>;

// ── AI enrichment response (single item) ──

const currentYear = new Date().getFullYear();

/** Counts how many times a `.catch()` fallback fired during AI response validation. */
export let aiValidationFallbackCount = 0;

/** Resets the fallback counter — call before each batch validation. */
export function resetAiValidationFallbackCount(): void {
  aiValidationFallbackCount = 0;
}

function warnOnCatch<T>(fallback: T, field: string) {
  return (ctx: { error: z.ZodError; input: unknown }) => {
    aiValidationFallbackCount++;
    const issues = ctx.error.issues.map((i) => i.message).join('; ');
    console.warn(
      `[schema] AI field "${field}" failed validation (${issues}), value: ${JSON.stringify(ctx.input)} → defaulting to ${JSON.stringify(fallback)}`,
    );
    return fallback;
  };
}

export const AiEnrichmentItemSchema = z.object({
  artist: z.string().default(''),
  title: z.string().default(''),
  year: z.number().int().min(1800).max(currentYear).nullable().catch(warnOnCatch(null, 'year')),
  country: SongCountrySchema.nullable().catch(warnOnCatch(null, 'country')),
  language: SongCountrySchema.nullable().catch(warnOnCatch(null, 'language')),
});

export const AiEnrichmentResponseSchema = z.array(AiEnrichmentItemSchema);

export type AiEnrichmentItem = z.infer<typeof AiEnrichmentItemSchema>;
