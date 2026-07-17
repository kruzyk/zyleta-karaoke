import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { filterExistingSongsToRawFiles } from '../process-filelist';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const rawFilelistPath = 'pipeline/input/raw-filelist.json';

describe('karaoke laptop sync', () => {
  it('uploads the file watched by the processing workflow', () => {
    const scanner = fs.readFileSync(
      path.join(root, 'pipeline/remote-scan/scan-and-upload.ps1'),
      'utf-8',
    );
    const workflow = fs.readFileSync(path.join(root, '.github/workflows/update-songs.yml'), 'utf-8');

    expect(scanner).toContain(`contents/${rawFilelistPath}`);
    expect(workflow).toContain(rawFilelistPath);
    expect(scanner).not.toContain('contents/data/raw-filelist.json');
  });

  it('drops songs removed from the latest laptop scan', () => {
    const songs = filterExistingSongsToRawFiles(
      [
        {
          id: 'keep',
          artist: 'Keep',
          title: 'Me',
          sourceFilename: 'Keep - Me.cdg',
        },
        {
          id: 'remove',
          artist: 'Gone',
          title: 'Song',
          sourceFilename: 'Gone - Song.cdg',
        },
      ],
      [{ filename: 'Keep - Me.cdg', artist: 'Keep', title: 'Me' }],
    );

    expect(songs.map((song) => song.id)).toEqual(['keep']);
  });
});
