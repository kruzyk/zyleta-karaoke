export interface Song {
  id: string;
  artist: string;
  title: string;
  // Phase 2 — extended metadata:
  genre?: string;
  year?: number;
  album?: string;
  language?: string;
  country?: string;   // ISO 3166-1 alpha-2 (e.g. 'PL', 'US', 'GB')
  isPolish?: boolean;  // true = Polish artist (regardless of song language)
}

export interface SongListState {
  songs: Song[];
  isLoading: boolean;
  error: string | null;
}

export type SortField = 'artist' | 'title';
export type Theme = 'dark' | 'light';
export type Language = 'en' | 'pl';

// Filter chip types
export type MainFilter = 'all' | 'international' | 'polish' | 'decades';
export type DecadeFilter = '60s' | '70s' | '80s' | '90s' | '00s' | '10s' | '20s';

export interface FilterState {
  main: MainFilter;
  decade: DecadeFilter | null;
  country: string | null; // ISO country code or null
}
