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
2. **GitHub Actions** — automatically processes the file list: parses filenames, queries MusicBrainz API (artist country, release year), deduplicates, and generates `pipeline/output/songs.json`.

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

Scripts are located in `pipeline/remote-scan/`. Run them on the Windows machine where your karaoke files are stored.

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

**GitHub token** — generate at https://github.com/settings/tokens (Fine-grained token). Required permission for regular updates: **Contents: Read and write** for the `zyleta-karaoke` repository. Full updates also need **Actions: Read and write**.

### Regular Update

Double-click `aktualizuj-liste.bat`. The script:
- scans all folders from `folderPaths`
- collects files matching the configured extensions
- uploads the file list to GitHub as `pipeline/input/raw-filelist.json`
- GitHub Actions processes the list, opens a PR for `pipeline/output/songs.json`, merges it after checks pass, and deploys the site

Logs are saved to `scan-log.txt` in the same folder as the script.

### Full Update (force refresh)

Double-click `wymus-pelna-aktualizacje.bat`. Does the same as a regular update, but additionally:
- clears the MusicBrainz cache
- forces re-fetching metadata (country, year) for **all** songs
- useful when you want to fix incorrect data or after changes to processing logic

**Note**: with a large library (9000+ songs), a full update can take several hours due to the MusicBrainz API rate limit.

## GitHub Actions

The project uses three workflows:

### 1. Process Song List (`update-songs.yml`)

Processes the raw file list into the final `songs.json`.

**Triggered automatically** on push to `master` that changes `pipeline/input/raw-filelist.json` (i.e., after running `aktualizuj-liste.bat`).

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
- opens or updates a PR with `songs.json`, waits for checks, then merges it

Requires repository secret `SONG_UPDATE_TOKEN` with **Contents: Read and write** and **Pull requests: Read and write** for `zyleta-karaoke`. This token creates the generated-song PR so required checks can run and `master` still rejects direct pushes.

The MusicBrainz cache is persisted between runs (via `actions/cache@v4`), so subsequent updates only process new songs.

### 2. Build and Deploy (`deploy.yml`)

Standard CI/CD pipeline — triggered automatically on every push to `master`, except raw laptop scans that only touch `pipeline/input/raw-filelist.json`.

The `build` job runs the security-policy tests, `npm ci`, the dependency audit, lint, application tests, and the production build.
The audit uses `npm audit --audit-level=high --omit=dev`.
High and critical findings block CI. Low and moderate findings remain visible but do not block CI.
This policy has no package-specific exceptions.

PR builds use a read-only token and receive no repository secrets.
Only a push to `master` supplies `CONFIGCAT_SDK_KEY` as `VITE_CONFIGCAT_SDK_KEY`.
The deployment job alone receives Pages and identity-token write permissions.
Separate concurrency groups prevent a PR build from canceling the production deployment.

### 3. Dependabot updates (`dependabot-security.yml`)

GitHub monitors the dependency graph when new advisories arrive. A source push is not necessary.
Dependabot alerts and security updates must remain enabled in the repository settings.
Dependabot creates repair PRs for the npm manifest and lockfile.
It also checks for routine npm version updates each day, with at most five open version-update PRs.
Automatic rebasing remains enabled. Dependabot checks existing PRs during its daily update run.
This configuration has no custom scanner.

The workflow enables native squash auto-merge only when all these conditions apply:

- Dependabot owns the PR and every commit has a verified Dependabot signature.
- The PR targets `master` in this repository and changes only `package.json` and `package-lock.json`.
- The PR changes the lockfile.
- Every update is a verified patch, minor, or major update for the root npm project.
- Strict rules require `build` and `dependabot-security-policy` from GitHub Actions, without an App bypass.

The same policy covers security repairs and routine version updates, including major updates.
Every PR must pass the audit, lint, tests, build, and other required protections before merge.
A label or PR title alone cannot authorize an update.
The policy removes previous auto-merge authorization before it authorizes another revision.
The required policy status prevents an old authorization from permitting an unchecked revision.
API errors fail the policy status. GitHub keeps unavailable repairs visible in Dependabot alerts.
Failed build steps or other required protections prevent automatic merges.

The privileged workflow reads policy code only from the default-branch revision.
It never checks out or executes PR code.
It reports the policy status directly on the PR head because `pull_request_target` runs against the default branch.
It uses the expected PR head in the native auto-merge mutation to reject a changed revision.

#### Activation

1. Register a dedicated GitHub App.
2. Grant **Contents: Read and write** and **Pull requests: Read and write**.
3. Install the App only on `kruzyk/zyleta-karaoke`.
4. Do not give the App an administration permission or a ruleset bypass.
5. Set the Actions variable `DEPENDABOT_AUTOMERGE_CLIENT_ID` to the App client ID.
6. Store the App private key in the Actions secret `DEPENDABOT_AUTOMERGE_PRIVATE_KEY`.
7. Merge these automation files into `master` through the normal PR process.
8. Add `dependabot-security-policy` to the **Dependency security checks** ruleset.
9. Keep `build` required in that ruleset.
10. Select **GitHub Actions** as the source for both checks (integration ID `15368`).
11. Keep strict checks enabled.
12. Preserve existing role bypasses, but do not add an App bypass.
13. Reopen an existing Dependabot PR if it needs a new policy run.

The App token expires after the job. The token action revokes it when the job ends.
Unlike `GITHUB_TOKEN`, the App token permits the automatic merge to trigger the normal `master` build and Pages deployment.
The workflow refuses auto-merge until the App configuration and both required checks are available.
Do not require the policy status before the workflow reaches `master`.
The existing master ruleset, including CodeQL and review protections, remains necessary.
The additional ruleset preserves the existing role bypasses for the raw-file-list uploader.
The policy checks that the App itself cannot bypass the required checks.

References: [Dependabot security updates](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/secure-your-dependencies/configure-security-updates),
[Dependabot metadata](https://github.com/dependabot/fetch-metadata),
and [token event restrictions](https://docs.github.com/en/actions/concepts/security/github_token).

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
│   ├── styles/                      # Global CSS, themes, fonts
│   ├── types/song.ts                # TypeScript interfaces
│   ├── config.ts                    # Centralized configuration
│   ├── App.tsx                      # Main app component
│   └── main.tsx                     # Entry point
├── pipeline/
│   ├── process-filelist.ts          # Raw file list → songs.json processor
│   ├── filename-parser.ts           # Filename → artist/title parser
│   ├── ai-enricher.ts               # AI metadata enrichment
│   ├── dedup.ts                     # Deduplication + manual overrides
│   ├── input/
│   │   ├── raw-filelist.json        # Raw file list (from karaoke laptop)
│   │   └── manual-overrides.json    # Manual song corrections
│   ├── output/
│   │   └── songs.json               # Song list (auto-generated by pipeline)
│   └── remote-scan/
│       ├── aktualizuj-liste.bat     # Regular update (double-click)
│       ├── wymus-pelna-aktualizacje.bat  # Force refresh (double-click)
│       ├── scan-and-upload.ps1      # Scan + upload PowerShell script
│       ├── scan-config.example.json # Example configuration
│       └── scan-config.json         # Your configuration (do not commit!)
├── .github/workflows/
│   ├── deploy.yml                   # CI/CD: lint → test → build → deploy
│   └── update-songs.yml             # Song list processing pipeline
└── package.json
```

## License

All rights reserved. © Żyleta Karaoke.
