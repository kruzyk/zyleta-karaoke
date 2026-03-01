# Żyleta Karaoke — Song List

A mobile-first web application for browsing and searching 5000+ karaoke songs. Built with React, TypeScript, and Vite. Hosted on GitHub Pages.

## Project Summary

The project consists of **50 files** forming a complete, ready-to-run application.

### Frontend (React + TypeScript + Vite)

- **Virtualized song list** (TanStack Virtual) — smooth 60fps scrolling even with 5000+ items
- **Fuzzy search** with Fuse.js — search by artist/title, typo-tolerant, handles Polish diacritics (accent-insensitive)
- **Dark/light neon theme** powered by CSS Custom Properties — instant switching, zero JS runtime cost
- **Language switcher** EN/PL (react-i18next) with localStorage persistence
- **Neon SVG logo** "ŻYLETA KARAOKE" — adapts to both themes with glow effects
- **Sticky search bar**, Back to Top button, Footer with social media links
- **SEO**: Open Graph, Twitter Card, JSON-LD (EntertainmentBusiness schema), robots.txt, sitemap.xml
- **93 sample songs** (Polish and international) included for development/testing
- **Accessibility**: WCAG 2.1 AA target, semantic HTML, keyboard navigation, ARIA labels, 44×44px touch targets
- **Performance targets**: Lighthouse ≥ 90, bundle < 150KB gzipped, LCP < 2.5s

### Data Pipeline (Node.js CLI)

- `npm run update-songs -- --path /folder/with/files` — scans folder, parses filenames, queries MusicBrainz API, deduplicates, generates `songs.json`
- `--skip-api` mode for quick refresh without API calls
- API response caching (`scripts/cache.json`), retry with exponential backoff
- Detailed report after each run (files scanned, resolved, duplicates removed, unresolved)
- `data/manual-overrides.json` for manual corrections of incorrectly resolved songs

### CI/CD

- GitHub Actions workflow: lint → test → build → deploy to GitHub Pages (automatically on push to `main`)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build tool | Vite 6 |
| Search | Fuse.js (fuzzy, accent-insensitive) |
| List virtualization | @tanstack/react-virtual |
| Internationalization | react-i18next |
| Styling | CSS Modules + CSS Custom Properties |
| Testing | Vitest + React Testing Library |
| Data pipeline | Node.js CLI + MusicBrainz API |
| Deployment | GitHub Pages + GitHub Actions |

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Run tests
npm run test

# Lint
npm run lint
```

## Updating the Song List

The song list is generated from a folder of karaoke audio/video files:

```bash
# Full pipeline (with MusicBrainz API lookup)
npm run update-songs -- --path /path/to/your/karaoke/files

# Quick mode (filename parsing only, no API)
npm run update-songs -- --path /path/to/your/karaoke/files --skip-api
```

The script scans the folder recursively for media files (.mp3, .wav, .flac, .mid, .kar, .mp4, .avi, .mkv, etc.), parses filenames to extract artist/title, optionally validates via MusicBrainz API, deduplicates (same artist + title = one entry), and generates `src/data/songs.json`.

For songs that aren't resolved correctly, add manual corrections to `data/manual-overrides.json`.

## Post-Setup Checklist

After cloning and running `npm install`, you need to:

1. **Update social media links** in `src/config.ts` (Facebook, Instagram URLs)
2. **Update site URL** in `src/config.ts` and `index.html` (OG meta tags, canonical URL, JSON-LD)
3. **Generate the real song list**: `npm run update-songs -- --path /your/karaoke/folder`
4. **Push to GitHub** — the site builds and deploys automatically via GitHub Actions
5. **Enable GitHub Pages** in repository Settings → Pages → Source: GitHub Actions

## Configuration

Edit `src/config.ts` to update:

- Site URL (for SEO and OG tags)
- Social media links (Facebook, Instagram)
- Search parameters (fuzzy threshold, debounce delay)
- Default language and theme

## Deployment

The site auto-deploys to GitHub Pages via GitHub Actions on push to `main`. To set up:

1. Go to repository Settings → Pages
2. Set source: GitHub Actions
3. Push to `main` — the workflow handles the rest

### Custom Domain (Future)

1. Purchase a domain (e.g., `zyletakaraoke.pl`)
2. Add a `CNAME` file in `public/` with your domain
3. Configure DNS records (A records for GitHub Pages IPs, or CNAME)
4. Update `siteUrl` in `src/config.ts`
5. Update URLs in `index.html` (OG tags, canonical, JSON-LD)
6. Enable HTTPS in GitHub Pages settings

## QR Code

Generate a QR code for the site URL using:

```bash
npx qrcode -o qr.png "https://your-site-url.com"
```

Or use [qrcode-monkey.com](https://www.qrcode-monkey.com/) for a branded QR with custom colors and logo in the center. Tips: minimum 2×2 cm print size, test with multiple phone cameras, use a short URL for a simpler QR pattern.

## Project Structure

```
├── src/
│   ├── assets/logo.svg              # Neon SVG logo
│   ├── components/
│   │   ├── Header/                  # Header, LanguageSwitcher, ThemeToggle
│   │   ├── SearchBar/               # Search input with fuzzy search
│   │   ├── SongList/                # Virtualized list + song items
│   │   ├── Footer/                  # Social links, copyright
│   │   └── common/                  # BackToTop, Spinner
│   ├── hooks/
│   │   ├── useTheme.ts              # Dark/light theme management
│   │   ├── useSongs.ts              # Song data loading + sorting
│   │   └── useSearch.ts             # Debounced Fuse.js search
│   ├── i18n/                        # EN/PL translations
│   ├── data/
│   │   ├── songs.json               # Generated song list (pipeline output)
│   │   └── sample-songs.ts          # 93 sample songs for development
│   ├── styles/                      # Global CSS, themes, fonts
│   ├── types/song.ts                # TypeScript interfaces
│   ├── utils/search.ts              # Fuse.js configuration
│   ├── config.ts                    # Centralized configuration
│   ├── App.tsx                      # Main app component
│   └── main.tsx                     # Entry point
├── scripts/
│   ├── update-songs.ts              # CLI entry point
│   ├── folder-scanner.ts            # Recursive media file scanner
│   ├── filename-parser.ts           # Filename → artist/title parser
│   ├── musicbrainz.ts               # MusicBrainz API client with caching
│   ├── dedup.ts                     # Deduplication + manual overrides
│   └── report-generator.ts          # Update summary report
├── data/manual-overrides.json       # Manual song corrections
├── public/                          # favicon, robots.txt, sitemap.xml
├── .github/workflows/deploy.yml     # CI/CD pipeline
├── REQUIREMENTS.md                  # Full project requirements
└── package.json
```

## License

All rights reserved. © Żyleta Karaoke.
