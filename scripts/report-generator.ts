import type { ParsedSong } from './filename-parser.js';

interface Song {
  id: string;
  artist: string;
  title: string;
}

export function generateReport(
  allFiles: string[],
  parsed: ParsedSong[],
  resolved: Song[],
  deduped: Song[],
  parsedFailed: ParsedSong[],
): string {
  const duplicatesRemoved = resolved.length - deduped.length;

  const lines: string[] = [
    '═══════════════════════════════════════════════',
    '  🎤 SONG LIST UPDATE REPORT',
    '═══════════════════════════════════════════════',
    '',
    `  📂 Files scanned:        ${allFiles.length}`,
    `  📝 Successfully parsed:  ${parsed.length - parsedFailed.length}`,
    `  🌐 Resolved:             ${resolved.length}`,
    `  🔄 Duplicates removed:   ${duplicatesRemoved}`,
    `  ✅ Total unique songs:   ${deduped.length}`,
    '',
  ];

  if (parsedFailed.length > 0) {
    lines.push('  ⚠️  UNPARSEABLE FILES (need manual review):');
    lines.push('  ─────────────────────────────────────────');
    for (const p of parsedFailed.slice(0, 20)) {
      lines.push(`    ${p.filename}`);
    }
    if (parsedFailed.length > 20) {
      lines.push(`    ... and ${parsedFailed.length - 20} more`);
    }
    lines.push('');
  }

  lines.push('═══════════════════════════════════════════════');

  return lines.join('\n');
}
