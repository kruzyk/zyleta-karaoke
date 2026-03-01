import { Header } from '@/components/Header/Header';
import { SearchBar } from '@/components/SearchBar/SearchBar';
import { SongList } from '@/components/SongList/SongList';
import { Footer } from '@/components/Footer/Footer';
import { BackToTop } from '@/components/common/BackToTop';
import { useTheme } from '@/hooks/useTheme';
import { useSongs } from '@/hooks/useSongs';
import { useSearch } from '@/hooks/useSearch';
import styles from './App.module.css';

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const { songs, isLoading, totalCount, sortField, setSortField } = useSongs();
  const search = useSearch(songs);

  return (
    <div className={styles.app}>
      <Header theme={theme} onToggleTheme={toggleTheme} />

      <main className={styles.main}>
        <div className={styles.content}>
          <SearchBar
            query={search.query}
            onChange={search.setQuery}
            resultCount={search.resultCount}
            totalCount={totalCount}
            isSearching={search.isSearching}
          />
          <SongList
            songs={search.isSearching ? search.results : songs}
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
