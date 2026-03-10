import { useState, useMemo, useCallback } from 'react';
import type { Song, MainFilter, DecadeFilter, FilterState } from '@/types/song';
import type { FeatureFlags } from '@/hooks/useFeatureFlags';

const DECADE_RANGES: Record<DecadeFilter, [number, number]> = {
  '60s': [1960, 1969],
  '70s': [1970, 1979],
  '80s': [1980, 1989],
  '90s': [1990, 1999],
  '00s': [2000, 2009],
  '10s': [2010, 2019],
  '20s': [2020, 2029],
};

const ALL_DECADES: DecadeFilter[] = ['60s', '70s', '80s', '90s', '00s', '10s', '20s'];

function filterByMain(songs: Song[], main: MainFilter): Song[] {
  switch (main) {
    case 'all':
      return songs;
    case 'polish':
      return songs.filter((s) => s.country === 'PL');
    case 'international':
      return songs.filter((s) => s.country != null && s.country !== 'PL');
    case 'decades':
      // "Decades" main chip shows all songs (decade sub-chip narrows further)
      return songs;
    default:
      return songs;
  }
}

function filterByDecade(songs: Song[], decade: DecadeFilter): Song[] {
  const [min, max] = DECADE_RANGES[decade];
  return songs.filter((s) => s.year != null && s.year >= min && s.year <= max);
}

function filterByCountry(songs: Song[], countryCode: string): Song[] {
  return songs.filter((s) => s.country === countryCode);
}

/** Extract unique country codes from international songs, sorted by frequency (descending) */
function getAvailableCountries(songs: Song[]): string[] {
  const intlSongs = songs.filter((s) => s.country != null && s.country !== 'PL');
  const countMap = new Map<string, number>();
  for (const s of intlSongs) {
    countMap.set(s.country!, (countMap.get(s.country!) || 0) + 1);
  }
  return [...countMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code]) => code);
}

/** Extract which decades have songs present */
function getAvailableDecades(songs: Song[]): DecadeFilter[] {
  const present = new Set<DecadeFilter>();
  for (const s of songs) {
    if (s.year == null) continue;
    for (const d of ALL_DECADES) {
      const [min, max] = DECADE_RANGES[d];
      if (s.year >= min && s.year <= max) {
        present.add(d);
        break;
      }
    }
  }
  return ALL_DECADES.filter((d) => present.has(d));
}

export function useFilter(allSongs: Song[], featureFlags: FeatureFlags) {
  const [filter, setFilter] = useState<FilterState>({
    main: 'all',
    decade: null,
    country: null,
  });

  const availableCountries = useMemo(() => getAvailableCountries(allSongs), [allSongs]);
  const availableDecades = useMemo(() => getAvailableDecades(allSongs), [allSongs]);

  const filteredSongs = useMemo(() => {
    let result = filterByMain(allSongs, filter.main);

    // Apply decade sub-filter
    if (filter.main === 'decades' && filter.decade && featureFlags.decades) {
      result = filterByDecade(result, filter.decade);
    }

    // Apply country sub-filter
    if (filter.main === 'international' && filter.country && featureFlags.international) {
      result = filterByCountry(result, filter.country);
    }

    return result;
  }, [allSongs, filter, featureFlags.decades, featureFlags.international]);

  const setMainFilter = useCallback((main: MainFilter) => {
    setFilter({ main, decade: null, country: null });
  }, []);

  const setDecadeFilter = useCallback((decade: DecadeFilter | null) => {
    setFilter((prev) => ({ ...prev, decade }));
  }, []);

  const setCountryFilter = useCallback((country: string | null) => {
    setFilter((prev) => ({ ...prev, country }));
  }, []);

  return useMemo(
    () => ({
      filter,
      filteredSongs,
      availableCountries,
      availableDecades,
      setMainFilter,
      setDecadeFilter,
      setCountryFilter,
    }),
    [filter, filteredSongs, availableCountries, availableDecades, setMainFilter, setDecadeFilter, setCountryFilter],
  );
}
