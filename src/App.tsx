import { useTranslation } from 'react-i18next';
import { Header } from '@/components/Header/Header';
import { SearchBar } from '@/components/SearchBar/SearchBar';
import { FilterChips } from '@/components/FilterChips/FilterChips';
import { SongList } from '@/components/SongList/SongList';
import { Footer } from '@/components/Footer/Footer';
import { useTheme } from '@/hooks/useTheme';
import { useSongs } from '@/hooks/useSongs';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useDisplaySongs } from '@/hooks/useDisplaySongs';
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
    search,
    displaySongs,
  } = useDisplaySongs(songs, allSongs, featureFlags);

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
    </div>
  );
}
