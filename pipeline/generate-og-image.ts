/**
 * Generate OG image (1200x630 PNG) for social media link previews.
 *
 * Usage: npx tsx scripts/generate-og-image.ts
 *
 * This creates public/og-image.png using SVG → PNG conversion via sharp.
 * Install sharp first: npm install -D sharp @types/sharp
 */

import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const WIDTH = 1200;
const HEIGHT = 630;

const svg = `
<svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="bgGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#ff00ff" stop-opacity="0.08"/>
      <stop offset="40%" stop-color="#00ffff" stop-opacity="0.04"/>
      <stop offset="70%" stop-color="#0a0a0f" stop-opacity="0"/>
    </radialGradient>
    <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="blur1"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="20" result="blur2"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="40" result="blur3"/>
      <feMerge>
        <feMergeNode in="blur3"/>
        <feMergeNode in="blur2"/>
        <feMergeNode in="blur1"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
    <filter id="cyanGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur1"/>
      <feGaussianBlur in="SourceGraphic" stdDeviation="15" result="blur2"/>
      <feMerge>
        <feMergeNode in="blur2"/>
        <feMergeNode in="blur1"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Background -->
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#0a0a0f"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bgGlow)"/>

  <!-- Decorative lines -->
  <line x1="120" y1="80" x2="1080" y2="80"
        stroke="rgba(0,255,255,0.2)" stroke-width="1"/>
  <line x1="120" y1="550" x2="1080" y2="550"
        stroke="rgba(0,255,255,0.2)" stroke-width="1"/>

  <!-- ŻYLETA - main text -->
  <text x="600" y="290"
        text-anchor="middle"
        font-family="Arial Black, Impact, sans-serif"
        font-weight="900"
        font-size="120"
        letter-spacing="8"
        fill="#ff00ff"
        filter="url(#neonGlow)">ŻYLETA</text>

  <!-- KARAOKE - subtitle -->
  <text x="600" y="370"
        text-anchor="middle"
        font-family="Arial, sans-serif"
        font-weight="400"
        font-size="42"
        letter-spacing="14"
        fill="#00ffff"
        filter="url(#cyanGlow)">KARAOKE</text>

  <!-- 5000+ SONGS -->
  <text x="600" y="440"
        text-anchor="middle"
        font-family="Arial, sans-serif"
        font-size="22"
        letter-spacing="4"
        fill="#8888aa">5000+ SONGS</text>
</svg>
`;

async function main() {
  const outputPath = path.resolve(__dirname, '../public/og-image.png');

  await sharp(Buffer.from(svg))
    .png({ quality: 90 })
    .toFile(outputPath);

  console.log(`✅ OG image generated: ${outputPath} (${WIDTH}x${HEIGHT})`);
}

main().catch(console.error);
