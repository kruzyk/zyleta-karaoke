import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
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
    expect(processWorkflow).toContain('gh pr checks');
    expect(processWorkflow).toContain('mergeStateStatus');
    expect(processWorkflow).toContain('Waiting for PR #$PR_NUMBER checks');
    expect(processWorkflow).not.toContain('--auto');
    expect(processWorkflow).not.toContain('git push origin HEAD:master');
    expect(processWorkflow).not.toContain('uses: actions/deploy-pages@');
    expect(deployWorkflow).toContain('pipeline/input/raw-filelist.json');
    expect(deployWorkflow).toContain('uses: actions/deploy-pages@');
  });

  it.each([false, true])(
    'refreshes a generated PR after master changes and reports API failures (%s)',
    (failUpdate) => {
      const workflow = fs.readFileSync(
        path.join(root, '.github/workflows/update-songs.yml'),
        'utf-8',
      ).replaceAll('\r\n', '\n');
      const loop = workflow.match(/          for attempt in \{1\.\.60\}; do[\s\S]*?          done/);
      if (!loop) throw new Error('The generated PR loop was not found.');
      const directory = fs.mkdtempSync(path.join(tmpdir(), 'song-pr-loop-'));
      try {
        const result = spawnSync(
          'bash',
          [
            '-e',
            '-o',
            'pipefail',
            '-c',
            `
              gh() {
                case "$*" in
                  'pr view 42 --json state --jq .state')
                    if [ -f "$TEST_DIRECTORY/updated" ]; then echo MERGED; else echo OPEN; fi ;;
                  'pr view 42 --json mergeStateStatus --jq .mergeStateStatus') echo BEHIND ;;
                  'pr view 42 --json headRefOid --jq .headRefOid') echo checked-head ;;
                  'pr checks 42 --json name,bucket,state')
                    echo '[{"name":"build","bucket":"pass","state":"SUCCESS"}]' ;;
                  'api --method PUT repos/owner/repo/pulls/42/update-branch -f expected_head_sha=checked-head')
                    echo checked-head > "$TEST_DIRECTORY/request"
                    if [ "$FAIL_UPDATE" = true ]; then return 1; fi
                    touch "$TEST_DIRECTORY/updated" ;;
                  *) echo "Unexpected command: $*" >&2; return 1 ;;
                esac
              }
              sleep() { :; }
              PR_NUMBER=42
              GITHUB_REPOSITORY=owner/repo
              ${loop[0]}
              exit 2
            `,
          ],
          {
            encoding: 'utf-8',
            env: {
              ...process.env,
              TEST_DIRECTORY: directory,
              FAIL_UPDATE: String(failUpdate),
            },
          },
        );
        expect(result.status, result.stderr).toBe(failUpdate ? 1 : 0);
        expect(fs.readFileSync(path.join(directory, 'request'), 'utf-8').trim()).toBe(
          'checked-head',
        );
      } finally {
        fs.rmSync(directory, { recursive: true, force: true });
      }
    },
  );

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
