import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '@/components/Header/Header';
import { SearchBar } from '@/components/SearchBar/SearchBar';
import { FilterChips } from '@/components/FilterChips/FilterChips';
import { SongList } from '@/components/SongList/SongList';
import { Footer } from '@/components/Footer/Footer';
import { BackToTop } from '@/components/common/BackToTop';
import { useTheme } from '@/hooks/useTheme';
import { useSongs } from '@/hooks/useSongs';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useFilter } from '@/hooks/useFilter';
import { useSearch } from '@/hooks/useSearch';
import styles from './App.module.css';

export default function App() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { songs, allSongs, isLoading, sortField, setSortField } = useSongs();
  const featureFlags = useFeatureFlags();

  const {
    filter,
    filteredSongs,
    availableCountries,
    availableDecades,
    setMainFilter,
    setDecadeFilter,
    setCountryFilter,
  } = useFilter(songs, featureFlags);

  // Search operates on the unsorted list so typo-tolerance works globally
  // and sort changes don't trigger a Fuse.js index rebuild.
  // Chip filter is then applied as an intersection with search results.
  const search = useSearch(allSongs);

  const displaySongs = useMemo(() => {
    if (!search.isSearching) return filteredSongs;
    const filterSet = new Set(filteredSongs);
    return search.results.filter((s) => filterSet.has(s));
  }, [search.isSearching, search.results, filteredSongs]);

  return (
    <div className={styles.app}>
      <a href="#main-content" className={styles.skipLink}>
        {t('common.skipToContent')}
      </a>
      <Header theme={theme} onToggleTheme={toggleTheme} />

      <main id="main-content" className={styles.main}>
        <div className={styles.content}>
          <SearchBar
            query={search.query}
            onChange={search.setQuery}
            resultCount={displaySongs.length}
            totalCount={filteredSongs.length}
            isSearching={search.isSearching}
          />
          <FilterChips
            activeMain={filter.main}
            activeDecade={filter.decade}
            activeCountry={filter.country}
            availableCountries={availableCountries}
            availableDecades={availableDecades}
            featureFlags={featureFlags}
            onMainChange={setMainFilter}
            onDecadeChange={setDecadeFilter}
            onCountryChange={setCountryFilter}
          />
          <SongList
            songs={displaySongs}
            isLoading={isLoading}
            sortField={sortField}
            onSortChange={setSortField}
          />
        </div>
      </main>

      <Footer />
      <BackToTop />
    </div>
  );
}
