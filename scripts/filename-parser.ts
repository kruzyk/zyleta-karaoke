import path from 'node:path';

export interface ParsedSong {
  filename: string;
  artist: string;
  title: string;
}

const SEPARATORS = [' - ', ' – ', ' — ', ' _ ', '_-_', ' -_', '_- '];

/**
 * Extract artist and title from a filename.
 * Handles various common naming conventions:
 *   - "Artist - Title.mp3"
 *   - "001 - Artist - Title.mp3"
 *   - "Artist — Title.mp3"
 *   - Folder-based: "Artist/Title.mp3"
 */
export function parseFilenames(files: string[]): ParsedSong[] {
  return files.map((file) => parseFilename(file));
}

function parseFilename(filepath: string): ParsedSong {
  const basename = path.basename(filepath, path.extname(filepath));
  const parentDir = path.basename(path.dirname(filepath));

  // Try splitting by known separators
  for (const sep of SEPARATORS) {
    if (basename.includes(sep)) {
      const parts = basename.split(sep).map((p) => p.trim()).filter(Boolean);

      if (parts.length >= 3) {
        // Might have a numbered prefix: "001 - Artist - Title"
        const firstIsNumber = /^\d+$/.test(parts[0]);
        if (firstIsNumber) {
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
        return {
          filename: filepath,
          artist: cleanString(parts[0]),
          title: cleanString(parts[1]),
        };
      }
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
