import { useState, useEffect, useRef, useMemo } from 'react';
import type { Song } from '@/types/song';
import { createSearchIndex, searchSongs } from '@/utils/search';
import config from '@/config';

export function useSearch(allSongs: Song[]) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Song[]>(allSongs);
  const indexRef = useRef(createSearchIndex(allSongs));

  // Rebuild index when songs change
  useEffect(() => {
    indexRef.current = createSearchIndex(allSongs);
  }, [allSongs]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults(allSongs);
      return;
    }

    const timer = setTimeout(() => {
      const found = searchSongs(indexRef.current, query, allSongs);
      setResults(found);
    }, config.search.debounceMs);

    return () => clearTimeout(timer);
  }, [query, allSongs]);

  const isSearching = query.trim().length > 0;

  return useMemo(
    () => ({
      query,
      setQuery,
      results,
      isSearching,
      resultCount: results.length,
    }),
    [query, results, isSearching],
  );
}
