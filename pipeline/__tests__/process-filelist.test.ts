import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyGenericArtistContext, filterExistingSongsToRawFiles } from '../process-filelist';

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

  it('keeps regular laptop updates to one automatic workflow path', () => {
    const regularUpdate = fs.readFileSync(
      path.join(root, 'pipeline/remote-scan/aktualizuj-liste.bat'),
      'utf-8',
    );
    const processWorkflow = fs.readFileSync(
      path.join(root, '.github/workflows/update-songs.yml'),
      'utf-8',
    );
    const deployWorkflow = fs.readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf-8');

    expect(regularUpdate).not.toContain('actions/workflows/update-songs.yml/dispatches');
    expect(processWorkflow).toContain('SONG_UPDATE_TOKEN');
    expect(processWorkflow).toContain('persist-credentials: false');
    expect(processWorkflow).toContain('gh pr create');
    expect(processWorkflow).toContain('gh pr merge');
    expect(processWorkflow).toContain('--auto');
    expect(processWorkflow).not.toContain('git push origin HEAD:master');
    expect(processWorkflow).not.toContain('uses: actions/deploy-pages@v4');
    expect(deployWorkflow).toContain('pipeline/input/raw-filelist.json');
    expect(deployWorkflow).toContain('uses: actions/deploy-pages@v4');
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

  it('keeps source context for generic AI artists', () => {
    const songs = applyGenericArtistContext([
      {
        id: 'aladdin-friend-like-me',
        artist: 'Disney',
        title: 'Friend Like Me',
        sourceFilename: 'Aladdin - Friend Like Me.mp4',
      },
      {
        id: 'szanty-bijatyka',
        artist: 'Traditional',
        title: 'Bijatyka',
        sourceFilename: 'Szanty - Bijatyka.kfn',
      },
      {
        id: 'abba-waterloo',
        artist: 'ABBA',
        title: 'Waterloo',
        sourceFilename: 'ABBA - Waterloo.kfn',
      },
    ]);

    expect(songs.map((song) => song.artist)).toEqual([
      'Disney - Aladdin',
      'Traditional - Szanty',
      'ABBA',
    ]);
  });
});
