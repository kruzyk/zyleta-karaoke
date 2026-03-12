import { useState, useEffect, useMemo } from 'react';
import type { Song, SongListState, SortField } from '@/types/song';

export function useSongs() {
  const [state, setState] = useState<SongListState>({
    songs: [],
    isLoading: true,
    error: null,
  });
  const [sortField, setSortField] = useState<SortField>('artist');

  useEffect(() => {
    let cancelled = false;

    async function loadSongs() {
      try {
        const module = await import('@/data/songs.json');
        const songs = module.default as Song[];

        if (!cancelled) {
          setState({
            songs,
            isLoading: false,
            error: songs.length === 0 ? 'Lista piosenek jest pusta.' : null,
          });
        }
      } catch {
        if (!cancelled) {
          setState({
            songs: [],
            isLoading: false,
            error: 'Nie udalo sie zaladowac listy piosenek.',
          });
        }
      }
    }

    loadSongs();
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedSongs = useMemo(() => {
    return [...state.songs].sort((a, b) => {
      const fieldA = a[sortField].toLowerCase();
      const fieldB = b[sortField].toLowerCase();
      return fieldA.localeCompare(fieldB, 'pl');
    });
  }, [state.songs, sortField]);

  return {
    songs: sortedSongs,
    isLoading: state.isLoading,
    error: state.error,
    totalCount: state.songs.length,
    sortField,
    setSortField,
  };
}
