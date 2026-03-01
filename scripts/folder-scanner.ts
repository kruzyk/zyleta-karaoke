import fs from 'node:fs/promises';
import path from 'node:path';

const MEDIA_EXTENSIONS = new Set([
  // Audio
  '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.wma', '.aac',
  // MIDI / Karaoke
  '.mid', '.midi', '.kar',
  // Video (some karaoke files are video)
  '.mp4', '.avi', '.mkv', '.wmv', '.mov', '.webm',
]);

export async function scanFolder(folderPath: string): Promise<string[]> {
  const files: string[] = [];

  async function scan(dir: string) {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip hidden directories
        if (!entry.name.startsWith('.')) {
          await scan(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (MEDIA_EXTENSIONS.has(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  await scan(folderPath);
  return files.sort();
}
