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
  'PL', 'EN', 'Sweden', 'Norway', 'Spain', 'Italy', 'Germany',
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

export type Song = z.infer<typeof SongSchema>;

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

export const AiEnrichmentItemSchema = z.object({
  artist: z.string().default(''),
  title: z.string().default(''),
  year: z.number().int().min(1800).max(currentYear).nullable().catch(null),
  country: SongCountrySchema.nullable().catch(null),
  language: SongCountrySchema.nullable().catch(null),
});

export const AiEnrichmentResponseSchema = z.array(AiEnrichmentItemSchema);

export type AiEnrichmentItem = z.infer<typeof AiEnrichmentItemSchema>;
