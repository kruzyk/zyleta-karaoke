export interface Song {
  id: string;
  artist: string;
  title: string;
  // Phase 2 — extended metadata:
  genre?: string;
  year?: number;
  album?: string;
  language?: string;
  country?: string;
}

export interface SongListState {
  songs: Song[];
  isLoading: boolean;
  error: string | null;
}

export type SortField = 'artist' | 'title';
export type Theme = 'dark' | 'light';
export type Language = 'en' | 'pl';
