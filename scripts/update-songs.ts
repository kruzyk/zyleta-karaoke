#!/usr/bin/env npx tsx
/**
 * Żyleta Karaoke — Song List Update Pipeline
 *
 * Usage:
 *   npm run update-songs -- --path /path/to/karaoke/files
 *   npm run update-songs -- --path /path/to/files --skip-api
 *
 * Options:
 *   --path, -p      Path to folder containing karaoke audio files (required)
 *   --skip-api      Skip MusicBrainz API lookup, use filename parsing only
 *   --output, -o    Output path for songs.json (default: src/data/songs.json)
 */

import { parseArgs } from 'node:util';
import path from 'node:path';
import fs from 'node:fs/promises';
import { scanFolder } from './folder-scanner.js';
import { parseFilenames } from './filename-parser.js';
import { resolveSongs } from './musicbrainz.js';
import { deduplicateSongs, applyManualOverrides, loadOverrides } from './dedup.js';
import { generateReport } from './report-generator.js';

async function main() {
  const { values } = parseArgs({
    options: {
      path: { type: 'string', short: 'p' },
      'skip-api': { type: 'boolean', default: false },
      output: { type: 'string', short: 'o' },
    },
    strict: true,
  });

  const folderPath = values.path;
  const skipApi = values['skip-api'] ?? false;
  const outputPath = values.output ?? path.join(process.cwd(), 'src', 'data', 'songs.json');

  if (!folderPath) {
    console.error('Error: --path is required');
    console.error('Usage: npm run update-songs -- --path /path/to/karaoke/files');
    process.exit(1);
  }

  try {
    // Verify folder exists
    await fs.access(folderPath);

    console.log(`\n🎤 Żyleta Karaoke — Song List Update\n`);
    console.log(`📂 Scanning: ${folderPath}`);

    // Step 1: Scan folder
    const files = await scanFolder(folderPath);
    console.log(`   Found ${files.length} audio/video files\n`);

    if (files.length === 0) {
      console.error('No audio files found in the specified folder.');
      process.exit(1);
    }

    // Step 2: Parse filenames
    console.log('📝 Parsing filenames...');
    const parsed = parseFilenames(files);
    const parsedOk = parsed.filter((p) => p.artist && p.title);
    const parsedFailed = parsed.filter((p) => !p.artist || !p.title);
    console.log(`   Parsed: ${parsedOk.length} OK, ${parsedFailed.length} incomplete\n`);

    // Step 3: Resolve via MusicBrainz (optional)
    let resolved;
    if (skipApi) {
      console.log('⏭️  Skipping MusicBrainz API (--skip-api)\n');
      resolved = parsedOk.map((p) => ({
        id: generateId(p.artist, p.title),
        artist: p.artist,
        title: p.title,
      }));
    } else {
      console.log('🌐 Resolving via MusicBrainz API...');
      console.log('   (This may take a while for large collections — 1 req/sec rate limit)');
      resolved = await resolveSongs(parsedOk);
      console.log(`   Resolved: ${resolved.length} songs\n`);
    }

    // Step 4: Apply manual overrides
    const overridesPath = path.join(process.cwd(), 'data', 'manual-overrides.json');
    const overrides = await loadOverrides(overridesPath);
    const withOverrides = applyManualOverrides(resolved, overrides);
    if (Object.keys(overrides).length > 0) {
      console.log(`🔧 Applied ${Object.keys(overrides).length} manual overrides\n`);
    }

    // Step 5: Deduplicate
    console.log('🔄 Deduplicating...');
    const deduped = deduplicateSongs(withOverrides);
    const dupsRemoved = withOverrides.length - deduped.length;
    console.log(`   Removed ${dupsRemoved} duplicates\n`);

    // Step 6: Write output
    const songsJson = JSON.stringify(deduped, null, 2);
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, songsJson, 'utf-8');
    console.log(`💾 Written: ${outputPath}`);
    console.log(`   Total unique songs: ${deduped.length}\n`);

    // Step 7: Generate report
    const report = generateReport(files, parsed, resolved, deduped, parsedFailed);
    console.log(report);

    console.log('\n✅ Done! Song list updated successfully.');
    console.log('   Next: review the output, update manual-overrides.json if needed,');
    console.log('   then commit and push to deploy.\n');
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function generateId(artist: string, title: string): string {
  return `${artist}-${title}`
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

main();
