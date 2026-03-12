import fs from 'node:fs/promises';
import type { Song } from './musicbrainz.js';

interface ManualOverride {
  artist?: string;
  title?: string;
  country?: string;
  year?: number;
}

/**
 * Normalize a string for deduplication comparison.
 * Strips diacritics, punctuation, extra whitespace and lowercases.
 * This ensures variants like "2 Plus 1" / "2 plus 1" / "2+1" collapse
 * into the same dedup key.
 */
function normalizeForDedup(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9\s]/g, '')    // strip punctuation
    .replace(/\s+/g, ' ')           // collapse whitespace
    .trim();
}

export function deduplicateSongs(songs: Song[]): Song[] {
  const seen = new Map<string, Song>();

  for (const song of songs) {
    const key = `${normalizeForDedup(song.artist)}||${normalizeForDedup(song.title)}`;
    if (!seen.has(key)) {
      seen.set(key, song);
    } else {
      // Prefer the entry that has more metadata (country/year)
      const existing = seen.get(key)!;
      const existingScore = (existing.country ? 1 : 0) + (existing.year ? 1 : 0);
      const newScore = (song.country ? 1 : 0) + (song.year ? 1 : 0);
      if (newScore > existingScore) {
        seen.set(key, song);
      }
    }
  }

  return Array.from(seen.values()).sort((a, b) =>
    a.artist.localeCompare(b.artist, 'pl', { sensitivity: 'base' }),
  );
}

export async function loadOverrides(
  filepath: string,
): Promise<Record<string, ManualOverride>> {
  try {
    const data = await fs.readFile(filepath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

export function applyManualOverrides(
  songs: Song[],
  overrides: Record<string, ManualOverride>,
): Song[] {
  if (Object.keys(overrides).length === 0) return songs;

  return songs.map((song) => {
    const override = overrides[song.id];
    if (override) {
      return {
        ...song,
        artist: override.artist ?? song.artist,
        title: override.title ?? song.title,
        ...(override.country !== undefined ? { country: override.country } : {}),
        ...(override.year !== undefined ? { year: override.year } : {}),
      };
    }
    return song;
  });
}
