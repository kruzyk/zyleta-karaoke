import path from 'node:path';

export interface ParsedSong {
  filename: string;
  artist: string;
  title: string;
}

/**
 * Ordered list of separator patterns to try.
 * More specific patterns first, less specific last.
 * Covers common karaoke file naming conventions:
 *   "Artist - Title"     (space-dash-space, most common)
 *   "Artist– Title"      (en-dash variants)
 *   "Artist— Title"      (em-dash variants)
 *   "Artist -Title"      (missing space before or after dash)
 *   "Artist- Title"      (missing space before dash)
 *   "Artist_-_Title"     (underscores around dash)
 */
const SEPARATORS = [
  // Spaced variants (most standard)
  ' - ',
  ' – ',
  ' — ',
  // Underscore variants
  '_-_',
  '_–_',
  '_—_',
  ' -_',
  '_- ',
  // Asymmetric spacing (one side missing space) — common in user-named files
  '- ',   // "Artist- Title"
  ' -',   // "Artist -Title"
  '– ',
  ' –',
  '— ',
  ' —',
  // No-space dashes (last resort, least reliable)
  '-',
];

export function parseFilenames(files: string[]): ParsedSong[] {
  return files.map((file) => parseFilename(file));
}

function parseFilename(filepath: string): ParsedSong {
  const basename = path.basename(filepath, path.extname(filepath));
  const parentDir = path.basename(path.dirname(filepath));

  // Try splitting by known separators (ordered from most to least specific)
  for (const sep of SEPARATORS) {
    if (!basename.includes(sep)) continue;

    const parts = basename.split(sep).map((p) => p.trim()).filter(Boolean);

    if (parts.length >= 3) {
      const firstIsNumber = /^\d+$/.test(parts[0]);
      if (firstIsNumber) {
        // "001 - Artist - Title" or "001- Artist- Title"
        return {
          filename: filepath,
          artist: cleanString(parts[1]),
          title: cleanString(parts.slice(2).join(' - ')),
        };
      }
      // "Artist - Title - Extra info" → keep artist + title only
      return {
        filename: filepath,
        artist: cleanString(parts[0]),
        title: cleanString(parts[1]),
      };
    }

    if (parts.length === 2) {
      // Guard: if using bare '-' separator, only accept if both parts are long enough
      // to avoid splitting things like "Guns N-Roses" or "Hi-Fi"
      if (sep === '-') {
        if (parts[0].length < 2 || parts[1].length < 2) continue;
      }
      return {
        filename: filepath,
        artist: cleanString(parts[0]),
        title: cleanString(parts[1]),
      };
    }
  }

  // Fallback: try folder name as artist, filename as title
  if (parentDir && parentDir !== '.' && parentDir !== path.basename(filepath)) {
    return {
      filename: filepath,
      artist: cleanString(parentDir),
      title: cleanString(basename),
    };
  }

  // Last resort: entire filename, no artist
  return {
    filename: filepath,
    artist: '',
    title: cleanString(basename),
  };
}

function cleanString(str: string): string {
  return str
    .replace(/\s*\(.*?\)\s*/g, ' ')   // Remove parenthetical info like (karaoke), (remix)
    .replace(/\s*\[.*?\]\s*/g, ' ')   // Remove bracket info like [HD], [instrumental]
    .replace(/\s+/g, ' ')             // Collapse multiple spaces
    .trim();
}
