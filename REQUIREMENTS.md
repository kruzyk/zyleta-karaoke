# Żyleta Karaoke — Song List Website Requirements

## 1. Project Overview

### 1.1 Business Context

"Żyleta karaoke" is a karaoke business run by Żyleta (stage name) across multiple clubs. Currently, the song list is shared with guests as a printed document. Guests choose a song from the list and sign up to sing by approaching Żyleta in person. **The sign-up process remains offline and unchanged** — the website's role is solely to make the song list browsable and searchable online.

### 1.2 Project Goals

- Make the song list accessible online via a mobile-friendly website
- Enable fast, intuitive song search by artist and title
- Establish a professional online presence for the "Żyleta karaoke" brand
- Simplify the song list update process for the owner
- Enable easy sharing of the website via QR codes, social media, and messaging apps

### 1.3 Target Users

- **Primary:** Karaoke guests in clubs, accessing the site on smartphones (Android & iPhone) after scanning a QR code displayed on screen or printed copies
- **Secondary:** Potential guests browsing the site from social media links or web search
- **Admin:** Żyleta (site owner) — manages the song list data

---

## 2. Functional Requirements

### 2.1 Song List Display

| ID | Requirement | Priority |
|----|-------------|----------|
| F-01 | Display the full song list with artist name and song title | Must-have |
| F-02 | Sort the list alphabetically by artist name (default) | Must-have |
| F-03 | Allow alternative sorting: by song title (A-Z) | Should-have |
| F-04 | Display total song count visible to users | Should-have |
| F-05 | Deduplicate songs: if the same artist + title appears multiple times (different versions/arrangements), show only one entry on the list | Must-have |
| F-06 | Virtualized/windowed list rendering — only render visible items to maintain performance with 5000+ songs | Must-have |
| F-07 | Infinite scroll or paginated view for browsing the full list | Should-have |

### 2.2 Search & Filtering

| ID | Requirement | Priority |
|----|-------------|----------|
| F-10 | Full-text search across artist name and song title | Must-have |
| F-11 | Search must be instant/responsive — results update as the user types (debounced, ~200ms) | Must-have |
| F-12 | Search must be accent-insensitive and case-insensitive (e.g., "slaski" matches "Śląski") | Must-have |
| F-13 | Fuzzy matching — tolerate minor typos (e.g., "Metalica" matches "Metallica") | Should-have |
| F-14 | Display "no results" state with a friendly message | Must-have |
| F-15 | Clear search button (X icon in search input) | Must-have |
| F-16 | Search bar should be sticky/always accessible while scrolling the list | Must-have |

#### Phase 2 — Extended Metadata Search

| ID | Requirement | Priority |
|----|-------------|----------|
| F-20 | Enrich song data with metadata: genre, year, album, language, country of origin | Nice-to-have (Phase 2) |
| F-21 | Filter songs by genre, language, decade/year range | Nice-to-have (Phase 2) |
| F-22 | Use MusicBrainz API (or similar) to fetch metadata during the data pipeline step | Nice-to-have (Phase 2) |

### 2.3 Internationalization (i18n)

| ID | Requirement | Priority |
|----|-------------|----------|
| F-30 | UI available in two languages: English (default) and Polish | Must-have |
| F-31 | Language switcher in the header — simple, accessible toggle/dropdown | Must-have |
| F-32 | Song data (artist names, titles) is NOT translated — displayed as-is regardless of UI language | Must-have |
| F-33 | Language preference persisted in localStorage so returning users see their chosen language | Should-have |
| F-34 | HTML `lang` attribute updated dynamically based on selected language | Must-have |

### 2.4 Theming

| ID | Requirement | Priority |
|----|-------------|----------|
| F-40 | Two color themes: Dark (default) and Light | Must-have |
| F-41 | Neon color palette for both themes — vibrant, glowing accents (pinks, cyans, purples) on dark/light backgrounds | Must-have |
| F-42 | Theme toggle in the header | Must-have |
| F-43 | Theme preference persisted in localStorage | Should-have |
| F-44 | Respect `prefers-color-scheme` OS setting as initial default (fallback: dark) | Should-have |

### 2.5 Branding & Logo

| ID | Requirement | Priority |
|----|-------------|----------|
| F-50 | Design a "Żyleta karaoke" logo in neon style | Must-have |
| F-51 | Logo must be SVG for scalability and performance | Must-have |
| F-52 | Logo adapts to both light and dark themes (neon glow effect on dark, adjusted contrast on light) | Must-have |
| F-53 | Logo displayed prominently in the header | Must-have |
| F-54 | Favicon derived from the logo | Should-have |

### 2.6 Layout & Navigation

| ID | Requirement | Priority |
|----|-------------|----------|
| F-60 | Single-page application — no multi-page navigation needed | Must-have |
| F-61 | **Header:** Logo + language switcher + theme toggle | Must-have |
| F-62 | **Main area:** Search bar (sticky) + song list | Must-have |
| F-63 | **Footer:** Social media links (Facebook, Instagram) + copyright notice | Must-have |
| F-64 | Social media links: URLs configurable (to be provided later), icons using standard brand icons | Must-have |
| F-65 | "Back to top" button appears when scrolling down | Should-have |

### 2.7 Sharing & Social

| ID | Requirement | Priority |
|----|-------------|----------|
| F-70 | Open Graph meta tags for rich previews when sharing on Facebook, Messenger, WhatsApp, etc. | Must-have |
| F-71 | Twitter/X Card meta tags | Should-have |
| F-72 | Descriptive, shareable page title and description in both PL and EN | Must-have |
| F-73 | OG image — branded preview image for social sharing | Should-have |

### 2.8 Future Features (Phase 2+)

| ID | Requirement | Priority |
|----|-------------|----------|
| F-80 | Song request form — users can suggest new songs to add to the list | Nice-to-have (Phase 2) |
| F-81 | Requests stored (e.g., in a Google Form/Sheet or simple backend) for Żyleta to review | Nice-to-have (Phase 2) |

---

## 3. Non-Functional Requirements

### 3.1 Performance

| ID | Requirement | Target |
|----|-------------|--------|
| NF-01 | First Contentful Paint (FCP) | < 1.5s on 4G mobile |
| NF-02 | Largest Contentful Paint (LCP) | < 2.5s |
| NF-03 | Time to Interactive (TTI) | < 3.5s on 4G mobile |
| NF-04 | Total bundle size (gzipped) | < 150 KB initial load |
| NF-05 | Song data lazy-loaded or bundled efficiently | Song JSON < 500 KB gzipped for 5000+ entries |
| NF-06 | Smooth scrolling and search with 5000+ items | No jank, 60fps scroll |
| NF-07 | Lighthouse Performance score | ≥ 90 |

### 3.2 Accessibility (a11y)

| ID | Requirement |
|----|-------------|
| NF-10 | WCAG 2.1 Level AA compliance |
| NF-11 | Full keyboard navigation support |
| NF-12 | Proper ARIA labels on interactive elements |
| NF-13 | Sufficient color contrast ratios (4.5:1 for text, 3:1 for large text) even with neon theme |
| NF-14 | Screen reader compatible — semantic HTML structure |
| NF-15 | Focus management — visible focus indicators |
| NF-16 | Lighthouse Accessibility score ≥ 90 |

### 3.3 SEO

| ID | Requirement |
|----|-------------|
| NF-20 | Semantic HTML5 structure (header, main, footer, headings hierarchy) |
| NF-21 | Meta title, description, keywords in both PL and EN |
| NF-22 | Open Graph and Twitter Card meta tags |
| NF-23 | Canonical URL |
| NF-24 | robots.txt and sitemap.xml |
| NF-25 | Structured data (JSON-LD) — LocalBusiness schema for karaoke business |
| NF-26 | Lighthouse SEO score ≥ 90 |
| NF-27 | Prerendered HTML for the main page content (for SPA SEO) |

### 3.4 Responsiveness

| ID | Requirement |
|----|-------------|
| NF-30 | Mobile-first design — optimized for 360px–428px viewport width |
| NF-31 | Fully responsive: mobile → tablet → desktop |
| NF-32 | Touch-friendly targets — minimum 44x44px tap targets |
| NF-33 | No horizontal scrolling on any viewport |
| NF-34 | Tested on: iOS Safari, Android Chrome, desktop Chrome, Firefox, Edge |

### 3.5 Reliability & Hosting

| ID | Requirement |
|----|-------------|
| NF-40 | Hosted on GitHub Pages (static site) |
| NF-41 | Architecture allows easy migration to custom domain (CNAME configuration) |
| NF-42 | HTTPS enforced (provided by GitHub Pages) |
| NF-43 | No backend server dependencies — fully static/client-side |
| NF-44 | Graceful offline behavior — display cached content if available (service worker/PWA optional) |

---

## 4. Data Architecture

### 4.1 Song Data Model

Each song entry in the data file contains:

```typescript
interface Song {
  id: string;           // Unique identifier (hash of artist+title)
  artist: string;       // Artist/band name (display name)
  title: string;        // Song title
  // Phase 2 fields (optional):
  genre?: string;       // e.g., "Rock", "Pop", "Disco Polo"
  year?: number;        // Release year
  album?: string;       // Album name
  language?: string;    // e.g., "Polish", "English"
  country?: string;     // Artist's country of origin
}
```

### 4.2 Data Storage

- Song data stored as a static JSON file (`songs.json`) in the repository
- File is loaded by the React app at runtime (lazy-loaded after initial render)
- No database, no backend API — purely static

### 4.3 Deduplication Rules

- **Duplicate definition:** Two entries with the same `artist` (case-insensitive, trimmed) AND the same `title` (case-insensitive, trimmed)
- **Resolution:** Keep only one entry per unique artist+title pair
- **Deduplication happens at the data pipeline level** (during song list generation), not at runtime

---

## 5. Data Pipeline — Song List Generation

### 5.1 Overview

A CLI tool (Node.js script) that scans a folder of karaoke backing track files and generates the `songs.json` data file used by the website.

### 5.2 Pipeline Steps

```
[Audio files folder] → [Filename parser] → [MusicBrainz API lookup] → [Deduplication] → [songs.json]
```

1. **Scan:** Recursively scan the provided folder for audio files (`.mp3`, `.wav`, `.flac`, `.midi`, `.mid`, `.kar`, `.ogg`, `.mp4`, `.avi`, `.mkv`, and other common media formats)
2. **Parse:** Extract potential artist and title from filenames using heuristics:
   - Split on ` - ` (most common separator)
   - Handle variations: `–`, `—`, `_-_`, etc.
   - Handle numbered prefixes (e.g., `001 - Artist - Title.mp3`)
   - Handle nested folders (e.g., `Artist/Title.mp3`)
3. **Resolve:** Query MusicBrainz API to validate and normalize:
   - Correct artist/title assignment (which part is artist, which is title)
   - Normalize artist name spelling
   - Normalize song title
   - Rate-limit API calls (MusicBrainz allows 1 req/sec)
   - Cache API responses to avoid re-querying known songs
4. **Deduplicate:** Remove duplicate entries (same artist + title, case-insensitive)
5. **Review:** Generate a human-readable diff/report showing:
   - New songs added
   - Songs that couldn't be resolved (require manual review)
   - Duplicates that were removed
6. **Output:** Write `songs.json` to the website's data directory

### 5.3 Manual Override

- A `manual-overrides.json` file allows Żyleta to manually correct entries that the API couldn't resolve or resolved incorrectly
- Format: `{ "filename": "original-file.mp3", "artist": "Correct Artist", "title": "Correct Title" }`
- Overrides take precedence over API results

### 5.4 Update Workflow (Single Action)

The goal is to make updates as simple as possible:

1. Żyleta adds/removes audio files from the source folder
2. Runs one command: `npm run update-songs -- --path /path/to/karaoke/files`
3. Script generates updated `songs.json` + diff report
4. Żyleta reviews the report, fixes any issues in `manual-overrides.json` if needed
5. Commits and pushes to GitHub → site auto-deploys via GitHub Pages

---

## 6. Technical Architecture

### 6.1 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Framework** | React 18+ with TypeScript | Owner's preferred technology, strong ecosystem |
| **Build tool** | Vite 5+ | Fast builds, excellent DX, native TS support, small bundles |
| **Styling** | CSS Modules + CSS Custom Properties | Scoped styles, native theming via CSS variables, zero runtime cost |
| **Search** | Fuse.js | Client-side fuzzy search, lightweight (~5KB), accent-insensitive |
| **List virtualization** | @tanstack/react-virtual (TanStack Virtual) | Efficient rendering of 5000+ items, lightweight |
| **i18n** | react-i18next + i18next | Industry standard, small footprint, supports lazy-loading translations |
| **Icons** | react-icons (subset) or inline SVGs | Social media icons, UI icons — tree-shakeable |
| **Linting** | ESLint + Prettier | Code quality and formatting |
| **Testing** | Vitest + React Testing Library | Fast, Vite-native testing |
| **Deployment** | GitHub Pages + GitHub Actions | Free hosting, automated deploys on push |
| **Data pipeline** | Node.js CLI script (TypeScript) | Same language as the app, runs locally |
| **API (pipeline)** | MusicBrainz API (free, open) | Song metadata resolution, no API key required |
| **Prerendering** | vite-plugin-prerender (or react-snap) | SEO — generates static HTML for the main page |

### 6.2 Project Structure

```
zyletakaraoke/
├── public/
│   ├── favicon.ico
│   ├── og-image.png              # Social sharing preview image
│   ├── robots.txt
│   └── sitemap.xml
├── src/
│   ├── assets/
│   │   └── logo.svg              # Neon logo
│   ├── components/
│   │   ├── Header/
│   │   │   ├── Header.tsx
│   │   │   ├── Header.module.css
│   │   │   ├── LanguageSwitcher.tsx
│   │   │   └── ThemeToggle.tsx
│   │   ├── SearchBar/
│   │   │   ├── SearchBar.tsx
│   │   │   └── SearchBar.module.css
│   │   ├── SongList/
│   │   │   ├── SongList.tsx       # Virtualized list
│   │   │   ├── SongList.module.css
│   │   │   └── SongItem.tsx
│   │   ├── Footer/
│   │   │   ├── Footer.tsx
│   │   │   └── Footer.module.css
│   │   └── common/
│   │       ├── BackToTop.tsx
│   │       └── Spinner.tsx
│   ├── hooks/
│   │   ├── useSearch.ts           # Search logic with Fuse.js
│   │   ├── useTheme.ts            # Theme management
│   │   └── useSongs.ts            # Song data loading
│   ├── i18n/
│   │   ├── i18n.ts                # i18next configuration
│   │   ├── en.json                # English translations
│   │   └── pl.json                # Polish translations
│   ├── data/
│   │   └── songs.json             # Generated song list
│   ├── styles/
│   │   ├── global.css             # Global styles, CSS reset
│   │   ├── themes.css             # CSS custom properties for dark/light neon themes
│   │   └── fonts.css              # Font declarations
│   ├── types/
│   │   └── song.ts                # TypeScript interfaces
│   ├── utils/
│   │   ├── search.ts              # Search configuration
│   │   └── dedup.ts               # Client-side dedup (backup)
│   ├── App.tsx
│   ├── App.module.css
│   └── main.tsx
├── scripts/
│   ├── update-songs.ts            # CLI: scan folder → generate songs.json
│   ├── musicbrainz.ts             # MusicBrainz API client
│   ├── filename-parser.ts         # Filename parsing heuristics
│   └── cache.json                 # API response cache (gitignored)
├── data/
│   └── manual-overrides.json      # Manual corrections for unresolved songs
├── .github/
│   └── workflows/
│       └── deploy.yml             # GitHub Actions: build & deploy to Pages
├── index.html                     # Vite entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .eslintrc.cjs
├── .prettierrc
└── README.md
```

### 6.3 Key Architectural Decisions

#### Static Site (No Backend)

The entire application is a static site served from GitHub Pages. All data processing happens at build/update time. This means:
- Zero hosting costs
- Maximum performance (CDN-served static files)
- No server maintenance
- Easy migration to any static hosting provider or custom domain

#### Client-Side Search

With ~5000 songs, client-side search is viable and preferred:
- No search server needed
- Instant results (no network latency)
- Works offline once loaded
- Fuse.js handles fuzzy matching, accent-insensitivity, and multi-field search in ~5KB

#### Virtualized List

With 5000+ songs, rendering all DOM elements would cause performance issues. TanStack Virtual renders only visible items (typically 15–30 at a time), ensuring smooth 60fps scrolling.

#### CSS Custom Properties for Theming

Instead of a CSS-in-JS solution, we use native CSS Custom Properties (variables) for theming. This provides:
- Zero JavaScript runtime cost for theming
- Instant theme switching (no re-renders)
- Easy to maintain and extend

---

## 7. Visual Design Guidelines

### 7.1 Neon Color Palette

#### Dark Theme (Default)

| Role | Color | Usage |
|------|-------|-------|
| Background | `#0a0a0f` | Page background |
| Surface | `#12121a` | Card/list backgrounds |
| Primary neon | `#ff00ff` (magenta/pink) | Logo glow, primary accents |
| Secondary neon | `#00ffff` (cyan) | Links, secondary accents |
| Tertiary neon | `#b700ff` (purple) | Hover states, highlights |
| Text primary | `#f0f0f5` | Main text |
| Text secondary | `#8888aa` | Dimmed/secondary text |
| Search highlight | `#ffff00` (yellow neon) | Matched text in search results |

#### Light Theme

| Role | Color | Usage |
|------|-------|-------|
| Background | `#f5f0ff` | Page background |
| Surface | `#ffffff` | Card/list backgrounds |
| Primary neon | `#cc00cc` (deeper magenta) | Logo, primary accents (darker for contrast) |
| Secondary neon | `#0099aa` (teal) | Links, secondary accents |
| Tertiary neon | `#8800cc` (deep purple) | Hover states |
| Text primary | `#1a1a2e` | Main text |
| Text secondary | `#555577` | Dimmed/secondary text |
| Search highlight | `#ff8800` (orange) | Matched text in search results |

### 7.2 Typography

- **Primary font:** Inter (or similar clean sans-serif) — loaded via Google Fonts with `font-display: swap`
- **Logo font:** Custom neon-style or stylized version of the brand name
- **Font sizes:** Mobile-first scale, base 16px, using `clamp()` for fluid typography

### 7.3 Neon Effects

- CSS `text-shadow` and `box-shadow` with glow colors for neon effect
- Subtle animated glow on logo (CSS animation, `will-change` optimized)
- Neon border/glow on search bar when focused
- Effects kept minimal on mobile for performance (reduced glow radius)

---

## 8. Configuration

The following values should be easily configurable in a single config file (`src/config.ts`):

```typescript
const config = {
  siteName: "Żyleta Karaoke",
  siteUrl: "https://<username>.github.io/zyletakaraoke",
  defaultLanguage: "en" as const,
  defaultTheme: "dark" as const,
  social: {
    facebook: "", // URL to be provided
    instagram: "", // URL to be provided
  },
  seo: {
    titleEn: "Żyleta Karaoke — Song List",
    titlePl: "Żyleta Karaoke — Lista Piosenek",
    descriptionEn: "Browse 5000+ karaoke songs. Find your favorite track and sing!",
    descriptionPl: "Przeglądaj ponad 5000 piosenek karaoke. Znajdź swój ulubiony utwór i śpiewaj!",
  },
  search: {
    debounceMs: 200,
    fuzzyThreshold: 0.3, // Fuse.js threshold (0 = exact, 1 = match anything)
    minCharacters: 1,
  },
};
```

---

## 9. QR Code — External Generation Guide

The QR code will be generated externally. Recommended approaches:

1. **Online generator:** Use [qr.io](https://qr.io) or [qrcode-monkey.com](https://www.qrcode-monkey.com/) — free, supports custom colors and logo embedding
2. **CLI tool:** `npx qrcode -o qr.png "https://<your-site-url>"` — generates a PNG from the terminal
3. **Tips:**
   - Use a short URL or custom domain for a simpler QR pattern
   - Test the QR code at different sizes and with different phone cameras
   - Print at minimum 2×2 cm for reliable scanning
   - Consider adding the neon logo in the center of the QR code for branding

---

## 10. Deployment & CI/CD

### 10.1 GitHub Actions Workflow

```yaml
# Trigger: push to main branch
# Steps:
# 1. Checkout code
# 2. Install dependencies (npm ci)
# 3. Run linter (npm run lint)
# 4. Run tests (npm run test)
# 5. Build production bundle (npm run build)
# 6. Deploy to GitHub Pages
```

### 10.2 Custom Domain Setup (Future)

When ready for a custom domain:
1. Purchase domain (e.g., `zyletakaraoke.pl`)
2. Add `CNAME` file to `public/` directory with the domain name
3. Configure DNS records (A records pointing to GitHub Pages IPs, or CNAME record)
4. Enable HTTPS in GitHub Pages settings

---

## 11. Acceptance Criteria Summary

The project is considered complete when:

1. ✅ Song list with 5000+ entries loads and displays correctly on mobile
2. ✅ Search finds songs by artist or title instantly, handles typos and Polish characters
3. ✅ Dark and light neon themes work and persist across sessions
4. ✅ Polish and English UI languages work and persist across sessions
5. ✅ Logo is displayed in neon style, adapts to both themes
6. ✅ Footer contains social media links (configurable)
7. ✅ Site shares well on social media (rich previews with OG tags)
8. ✅ Lighthouse scores: Performance ≥ 90, Accessibility ≥ 90, SEO ≥ 90
9. ✅ Data pipeline script successfully generates `songs.json` from a folder of audio files
10. ✅ Duplicates are correctly removed (same artist + title)
11. ✅ Site deploys automatically via GitHub Actions on push to main
12. ✅ No login or authentication required to access the site
13. ✅ Works on iOS Safari, Android Chrome, and major desktop browsers

---

## 12. Phases & Roadmap

### Phase 1 — MVP (Core)
- Song list display with virtualization
- Search by artist and title (fuzzy, accent-insensitive)
- Dark/light neon themes
- EN/PL language switcher
- Neon logo design
- Footer with social media links
- SEO optimization (meta tags, OG, structured data)
- Data pipeline CLI script (filename parsing + MusicBrainz)
- GitHub Pages deployment with CI/CD
- Accessibility compliance (WCAG 2.1 AA)

### Phase 2 — Enhanced Metadata
- Enrich songs with genre, year, language, country via MusicBrainz
- Filter/faceted search by metadata
- Song request form (suggest new songs)

---

*Document version: 1.0*
*Created: 2026-03-01*
*Author: Requirements gathered with Żyleta (Jacek)*
