# Żyleta Karaoke — Song List

A mobile-first web application for browsing and searching karaoke songs. Built with React 18, TypeScript, and Vite 6. Hosted on GitHub Pages.

## Table of Contents

1. [Overview](#overview)
2. [Tech Stack](#tech-stack)
3. [Getting Started](#getting-started)
4. [Karaoke Laptop Scripts](#karaoke-laptop-scripts)
5. [GitHub Actions](#github-actions)
6. [Feature Flags (ConfigCat)](#feature-flags-configcat)
7. [Manual Song Overrides](#manual-song-overrides)
8. [Configuration](#configuration)
9. [Deployment](#deployment)
10. [Project Structure](#project-structure)

## Overview

### Frontend

Virtualized song list (TanStack Virtual) with fuzzy search (Fuse.js) — handles Polish diacritics, tolerates typos. Neon dark/light theme with instant switching, PL/EN language toggle (react-i18next). Filter chips: All, Polish, International, Decades (60s–20s).

### Data Pipeline

Two-stage song list update process:

1. **Karaoke laptop** — a PowerShell script scans folders with karaoke files and uploads the file list to GitHub via API.
2. **GitHub Actions** — automatically processes the file list: parses filenames, queries MusicBrainz API (artist country, release year), deduplicates, and generates `src/data/songs.json`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript |
| Build tool | Vite 6 |
| Search | Fuse.js (fuzzy, accent-insensitive) |
| List virtualization | @tanstack/react-virtual |
| Internationalization | react-i18next (PL/EN) |
| Styling | CSS Modules + CSS Custom Properties |
| Testing | Vitest + React Testing Library |
| Song metadata | MusicBrainz API (artist country, release year) |
| Feature flags | ConfigCat |
| Deployment | GitHub Pages + GitHub Actions |

## Getting Started

```bash
npm install      # Install dependencies
npm run dev      # Start dev server
npm run build    # Production build
npm run preview  # Preview production build
npm run test     # Run tests
npm run lint     # Run linter
```

## Karaoke Laptop Scripts

Scripts are located in `scripts/remote-scan/`. Run them on the Windows machine where your karaoke files are stored.

### Setup (one-time)

1. Copy `scan-config.example.json` as `scan-config.json` in the same folder.
2. Fill in your configuration:

```json
{
  "folderPaths": [
    "D:\\Karaoke\\Piosenki",
    "E:\\Muzyka\\Karaoke",
    "C:\\Users\\Jacek\\Music\\Karaoke"
  ],
  "githubRepo": "kruzyk/zyleta-karaoke",
  "githubToken": "github_pat_...",
  "fileExtensions": [".mp3", ".kfn", ".wav", ".mid", ".kar", ".mp4", ".avi", ".mkv", ".cdg", ".wmv"]
}
```

**GitHub token** — generate at https://github.com/settings/tokens (Fine-grained token). Required permission: **Contents: Read and write** for the `zyleta-karaoke` repository.

### Regular Update

Double-click `aktualizuj-liste.bat`. The script:
- scans all folders from `folderPaths`
- collects files matching the configured extensions
- uploads the file list to GitHub as `data/raw-filelist.json`
- GitHub Actions automatically processes the list and updates the site

Logs are saved to `scan-log.txt` in the same folder as the script.

### Full Update (force refresh)

Double-click `wymus-pelna-aktualizacje.bat`. Does the same as a regular update, but additionally:
- clears the MusicBrainz cache
- forces re-fetching metadata (country, year) for **all** songs
- useful when you want to fix incorrect data or after changes to processing logic

**Note**: with a large library (9000+ songs), a full update can take several hours due to the MusicBrainz API rate limit.

## GitHub Actions

The project uses two workflows:

### 1. Process Song List (`update-songs.yml`)

Processes the raw file list into the final `songs.json`.

**Triggered automatically** on push to `master` that changes `data/raw-filelist.json` (i.e., after running `aktualizuj-liste.bat`).

**Manual trigger** (e.g., after changes to parser logic):
1. Go to **github.com/kruzyk/zyleta-karaoke** → **Actions** tab
2. Click **"Process Song List"** on the left
3. Click **"Run workflow"** (top right)
4. Set `force_refresh` to `true` to clear cache and re-fetch all data
5. Click **"Run workflow"**

Pipeline steps:
- validates `raw-filelist.json` (minimum 10 files)
- parses filenames into artist/title
- queries MusicBrainz API for artist country and release year
- applies manual overrides from `data/manual-overrides.json`
- deduplicates (same artist + title = one entry)
- safety check: aborts if the new list is less than half the size of the previous one
- commits `songs.json` and triggers deploy

The MusicBrainz cache is persisted between runs (via `actions/cache@v4`), so subsequent updates only process new songs.

### 2. Build and Deploy (`deploy.yml`)

Standard CI/CD pipeline — triggered automatically on every push to `master`.

Pipeline: lint → test → build → deploy to GitHub Pages.

The `CONFIGCAT_SDK_KEY` secret is injected during build as `VITE_CONFIGCAT_SDK_KEY`.

## Feature Flags (ConfigCat)

Feature flags allow toggling functionality without code changes or redeployment.

### Available Flags

| Flag | Description | Effect |
|------|-------------|--------|
| `decadesFilter` | Decades filter | Shows/hides the "Decades" chip and sub-chips (60s, 70s, 80s, 90s, 00s, 10s, 20s) |
| `international` | Country breakdown | Shows/hides country flags under the "International" chip |

### Managing Flags

**Production (ConfigCat dashboard)**:
1. Log in at https://app.configcat.com
2. Navigate to the appropriate environment
3. Toggle the flag value → changes take effect on the site within 5 minutes (auto-poll)

**Local development** — environment variables in `.env`:
```
VITE_FF_DECADES=true
VITE_FF_INTERNATIONAL=true
```
Local env vars take priority over ConfigCat.

**Fallback** — if ConfigCat is unavailable or the SDK key is missing, the app uses values from `src/config.ts` (both flags enabled by default).

### SDK Key Setup

The ConfigCat SDK key is stored as a GitHub Secret:
1. Go to **github.com/kruzyk/zyleta-karaoke** → **Settings** → **Secrets and variables** → **Actions**
2. Add a secret named `CONFIGCAT_SDK_KEY` with the SDK key from the ConfigCat dashboard

## Manual Song Overrides

If MusicBrainz returns incorrect data for a specific song, add a manual override in `data/manual-overrides.json`:

```json
{
  "overrides": [
    {
      "artist": "ABBA",
      "title": "Waterloo",
      "country": "SE",
      "year": 1974
    }
  ]
}
```

Overrides are applied after the MusicBrainz lookup and take precedence over automatically fetched values.

## Configuration

Edit `src/config.ts` to update:
- Site URL (for SEO and OG tags)
- Social media links (Facebook, Instagram)
- Search parameters (fuzzy threshold, debounce delay)
- Default language and theme
- Default feature flag values

## Deployment

The site auto-deploys to GitHub Pages on every push to `master`.

One-time setup:
1. GitHub → Settings → Pages → Source: **GitHub Actions**
2. GitHub → Settings → Secrets → add `CONFIGCAT_SDK_KEY`
3. Push to `master` — the rest happens automatically

### Custom Domain (optional)

1. Purchase a domain (e.g., `zyletakaraoke.pl`)
2. Add a `CNAME` file in `public/` with your domain
3. Configure DNS records (A records for GitHub Pages IPs, or CNAME)
4. Update `siteUrl` in `src/config.ts`
5. Update URLs in `index.html` (OG tags, canonical, JSON-LD)
6. Enable HTTPS in GitHub Pages settings

## Project Structure

```
├── src/
│   ├── assets/logo.svg              # Neon SVG logo
│   ├── components/
│   │   ├── Header/                  # Header, LanguageSwitcher, ThemeToggle
│   │   ├── SearchBar/               # Search input with fuzzy search
│   │   ├── SongList/                # Virtualized song list
│   │   ├── FilterChips/             # Filter chips (Polish, International, Decades)
│   │   ├── Footer/                  # Social media links, copyright
│   │   └── common/                  # BackToTop, Spinner
│   ├── hooks/
│   │   ├── useTheme.ts              # Dark/light theme management
│   │   ├── useSongs.ts              # Song data loading + sorting
│   │   ├── useSearch.ts             # Debounced Fuse.js search
│   │   └── useFeatureFlags.ts       # Feature flags (ConfigCat + env + fallback)
│   ├── i18n/                        # EN/PL translations
│   ├── data/
│   │   └── songs.json               # Song list (auto-generated by pipeline)
│   ├── styles/                      # Global CSS, themes, fonts
│   ├── types/song.ts                # TypeScript interfaces
│   ├── config.ts                    # Centralized configuration
│   ├── App.tsx                      # Main app component
│   └── main.tsx                     # Entry point
├── scripts/
│   ├── process-filelist.ts          # Raw file list → songs.json processor
│   ├── filename-parser.ts           # Filename → artist/title parser
│   ├── musicbrainz.ts               # MusicBrainz API client with two-level cache
│   ├── dedup.ts                     # Deduplication + manual overrides
│   └── remote-scan/
│       ├── aktualizuj-liste.bat     # Regular update (double-click)
│       ├── wymus-pelna-aktualizacje.bat  # Force refresh (double-click)
│       ├── scan-and-upload.ps1      # Scan + upload PowerShell script
│       ├── scan-config.example.json # Example configuration
│       └── scan-config.json         # Your configuration (do not commit!)
├── data/
│   ├── raw-filelist.json            # Raw file list (from karaoke laptop)
│   └── manual-overrides.json        # Manual song corrections
├── .github/workflows/
│   ├── deploy.yml                   # CI/CD: lint → test → build → deploy
│   └── update-songs.yml             # Song list processing pipeline
└── package.json
```

## License

All rights reserved. © Żyleta Karaoke.
