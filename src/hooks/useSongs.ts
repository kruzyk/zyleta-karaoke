import { useState, useEffect, useMemo } from 'react';
import type { Song, SongListState, SortField } from '@/types/song';
import { stripLeadingQuote } from '@/utils/sort-key';

export function useSongs() {
  const [state, setState] = useState<SongListState>({
    songs: [],
    isLoading: true,
    error: null,
  });
  const [sortField, setSortField] = useState<SortField>('artist');

  /* eslint-disable react-you-might-not-need-an-effect/no-initialize-state, react-you-might-not-need-an-effect/no-external-store-subscription --
     This effect loads one asynchronous snapshot. It does not subscribe to a store. */
  useEffect(() => {
    let cancelled = false;

    async function loadSongs() {
      try {
        const module = await import('@pipeline/output/songs.json');
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
  /* eslint-enable react-you-might-not-need-an-effect/no-initialize-state, react-you-might-not-need-an-effect/no-external-store-subscription */

  const sortedSongs = useMemo(() => {
    return [...state.songs].sort((a, b) => {
      const fieldA = stripLeadingQuote(a[sortField]).toLowerCase();
      const fieldB = stripLeadingQuote(b[sortField]).toLowerCase();
      return fieldA.localeCompare(fieldB, 'pl');
    });
  }, [state.songs, sortField]);

  return {
    songs: sortedSongs,
    allSongs: state.songs,
    isLoading: state.isLoading,
    error: state.error,
    totalCount: state.songs.length,
    sortField,
    setSortField,
  };
}
