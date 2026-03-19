export type SongCountry = 'PL' | 'EN' | 'Sweden' | 'Norway' | 'Spain' | 'Italy' | 'Germany';

export interface Song {
  id: string;
  artist: string;
  title: string;
  year?: number;
  country?: SongCountry;
  language?: SongCountry;
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
  country: SongCountry | null;
}
