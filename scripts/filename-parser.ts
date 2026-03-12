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
 *   "Artist_Title"       (underscore only)
 *   "Artist  Title"      (double space)
 */
const SEPARATORS = [
  // Spaced variants (most standard)
  ' - ',
  ' – ',
  ' — ',
  // Double space (some collections use this)
  '  ',
  // Underscore-dash variants
  '_-_',
  '_–_',
  '_—_',
  ' -_',
  '_- ',
  // Asymmetric spacing (one side missing space)
  '- ',   // "Artist- Title"
  ' -',   // "Artist -Title"
  '– ',
  ' –',
  '— ',
  ' —',
  // Underscore as separator (e.g. "Knez_ADIO")
  '_',
  // No-space dashes (last resort, least reliable)
  '-',
];

// Minimum part length for unreliable separators to avoid false splits
const MIN_PART_LENGTH: Record<string, number> = {
  '-': 2,   // Avoid splitting "Guns N-Roses" or "Hi-Fi"
  '_': 2,   // Avoid splitting single-char parts
  '  ': 2,  // Avoid splitting on accidental double spaces in short names
};

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
    const minLen = MIN_PART_LENGTH[sep] ?? 0;

    if (parts.length >= 3) {
      const firstIsNumber = /^\d+$/.test(parts[0]);
      if (firstIsNumber) {
        // "001 - Artist - Title" or "001- Artist- Title"
        return {
          filename: filepath,
          artist: cleanString(parts[1]),
          title: cleanTitle(parts.slice(2).join(' - ')),
        };
      }
      // "Artist - Title - Extra info" → keep artist + first title part
      return {
        filename: filepath,
        artist: cleanString(parts[0]),
        title: cleanTitle(parts.slice(1).join(sep)),
      };
    }

    if (parts.length === 2) {
      // Guard: for unreliable separators, require minimum part length
      if (minLen > 0 && (parts[0].length < minLen || parts[1].length < minLen)) continue;
      return {
        filename: filepath,
        artist: cleanString(parts[0]),
        title: cleanTitle(parts[1]),
      };
    }
  }

  // Fallback: try folder name as artist, filename as title
  if (parentDir && parentDir !== '.' && parentDir !== path.basename(filepath)) {
    return {
      filename: filepath,
      artist: cleanString(parentDir),
      title: cleanTitle(basename),
    };
  }

  // Last resort: entire filename, no artist
  return {
    filename: filepath,
    artist: '',
    title: cleanTitle(basename),
  };
}

/**
 * Clean artist name: collapse whitespace, trim.
 * Does NOT strip brackets — [Disney], [theatre] are valid artist labels.
 */
function cleanString(str: string): string {
  return str
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean song title: remove common suffixes like (karaoke), (remix), [HD],
 * but keep meaningful content in parentheses (e.g. song subtitles).
 */
function cleanTitle(str: string): string {
  return str
    .replace(/\s*\((karaoke|instrumental|remix|vocal|backing\s*track|sing[- ]?along)\)\s*/gi, ' ')
    .replace(/\s*\[(karaoke|instrumental|hd|hq|lyrics?|official|video|audio)\]\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
