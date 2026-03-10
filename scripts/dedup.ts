import fs from 'node:fs/promises';
import type { Song } from './musicbrainz.js';

interface ManualOverride {
  artist?: string;
  title?: string;
  country?: string;
  year?: number;
}

export function deduplicateSongs(songs: Song[]): Song[] {
  const seen = new Map<string, Song>();

  for (const song of songs) {
    const key = `${song.artist.toLowerCase().trim()}||${song.title.toLowerCase().trim()}`;
    if (!seen.has(key)) {
      seen.set(key, song);
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
