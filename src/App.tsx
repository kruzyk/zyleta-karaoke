import { Header } from '@/components/Header/Header';
import { SearchBar } from '@/components/SearchBar/SearchBar';
import { FilterChips } from '@/components/FilterChips/FilterChips';
import { SongList } from '@/components/SongList/SongList';
import { Footer } from '@/components/Footer/Footer';
import { BackToTop } from '@/components/common/BackToTop';
import { useTheme } from '@/hooks/useTheme';
import { useSongs } from '@/hooks/useSongs';
import { useFilter } from '@/hooks/useFilter';
import { useSearch } from '@/hooks/useSearch';
import styles from './App.module.css';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { songs, isLoading, totalCount, sortField, setSortField } = useSongs();

  // Filter chips narrow down songs first, then search operates within filtered set
  const {
    filter,
    filteredSongs,
    availableCountries,
    availableDecades,
    setMainFilter,
    setDecadeFilter,
    setCountryFilter,
  } = useFilter(songs);

  const search = useSearch(filteredSongs);

  // Display songs: if searching → search results, else → filtered songs
  const displaySongs = search.isSearching ? search.results : filteredSongs;

  return (
    <div className={styles.app}>
      <Header theme={theme} onToggleTheme={toggleTheme} />

      <main className={styles.main}>
        <div className={styles.content}>
          <SearchBar
            query={search.query}
            onChange={search.setQuery}
            resultCount={search.resultCount}
            totalCount={filteredSongs.length}
            isSearching={search.isSearching}
          />
          <FilterChips
            activeMain={filter.main}
            activeDecade={filter.decade}
            activeCountry={filter.country}
            availableCountries={availableCountries}
            availableDecades={availableDecades}
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
