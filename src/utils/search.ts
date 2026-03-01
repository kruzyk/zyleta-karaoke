import Fuse from 'fuse.js';
import type { Song } from '@/types/song';

/**
 * Normalize a string for comparison:
 * - lowercase
 * - strip diacritics (ś→s, ó→o, ą→a, etc.)
 */
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Check if any word in `text` starts with `prefix`.
 * Words are split on spaces, hyphens, slashes, dots, parentheses, etc.
 *
 * Examples (prefix = "man"):
 *   "Varius Manx"       → true  ("Manx" starts with "man")
 *   "Man In The Mirror"  → true  ("Man" starts with "man")
 *   "Enter Sandman"      → false ("man" is a suffix, not a word start)
 *   "Bad Romance"        → false ("man" is in the middle of "Romance")
 *   "No Woman No Cry"    → false ("man" is in the middle of "Woman")
 */
function wordPrefixMatch(text: string, prefix: string): boolean {
  const normalized = normalize(text);
  const p = normalize(prefix);

  // Split on word boundaries: spaces, hyphens, slashes, dots, parens, apostrophes
  const words = normalized.split(/[\s\-\/\.\(\)'"]+/);
  return words.some((word) => word.startsWith(p));
}

/**
 * Primary search: word-prefix match (case-insensitive, accent-insensitive).
 * Returns songs where any word in artist OR title starts with the query.
 */
function wordPrefixSearch(songs: Song[], query: string): Song[] {
  return songs.filter(
    (song) => wordPrefixMatch(song.artist, query) || wordPrefixMatch(song.title, query),
  );
}

/**
 * Fallback search: Fuse.js fuzzy matching for typo tolerance.
 * Only used when word-prefix search returns no results.
 */
const fuseOptions: Fuse.IFuseOptions<Song> = {
  keys: [
    { name: 'artist', weight: 0.6 },
    { name: 'title', weight: 0.4 },
  ],
  threshold: 0.25,
  includeScore: true,
  ignoreLocation: true,
  minMatchCharLength: 2,
  shouldSort: true,
};

export function createSearchIndex(songs: Song[]): Fuse<Song> {
  return new Fuse(songs, fuseOptions);
}

/**
 * Two-tier search strategy:
 * 1. Word-prefix match — any word in artist/title starts with query
 * 2. Fuzzy match via Fuse.js — only if tier 1 returns nothing (handles typos)
 */
export function searchSongs(
  index: Fuse<Song>,
  query: string,
  allSongs: Song[],
): Song[] {
  const trimmed = query.trim();
  if (!trimmed) return [];

  // Tier 1: Word-prefix match
  const matched = wordPrefixSearch(allSongs, trimmed);
  if (matched.length > 0) return matched;

  // Tier 2: Fuzzy fallback (typos like "Metalica" → "Metallica")
  return index.search(trimmed).map((result) => result.item);
}
