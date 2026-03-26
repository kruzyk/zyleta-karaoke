import { useMemo } from 'react';
import type { Song } from '@/types/song';
import type { FeatureFlags } from '@/hooks/useFeatureFlags';
import { useFilter } from '@/hooks/useFilter';
import { useSearch } from '@/hooks/useSearch';

/**
 * Composes useFilter and useSearch, returning the intersection of their results
 * as `displaySongs`. Search operates on the full list for global typo-tolerance;
 * the active chip filter is applied as a post-intersection step.
 */
export function useDisplaySongs(allSongs: Song[], featureFlags: FeatureFlags) {
  const filterResult = useFilter(allSongs, featureFlags);
  const search = useSearch(allSongs);

  const displaySongs = useMemo(() => {
    if (!search.isSearching) return filterResult.filteredSongs;
    const filterSet = new Set(filterResult.filteredSongs);
    return search.results.filter((s) => filterSet.has(s));
  }, [search.isSearching, search.results, filterResult.filteredSongs]);

  return { ...filterResult, search, displaySongs };
}
