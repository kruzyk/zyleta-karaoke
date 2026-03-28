import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Header } from '@/components/Header/Header';
import { SearchBar } from '@/components/SearchBar/SearchBar';
import { FilterChips } from '@/components/FilterChips/FilterChips';
import { SongList } from '@/components/SongList/SongList';
import { WishlistFAB } from '@/components/Wishlist/WishlistFAB';
import { WishlistPanel } from '@/components/Wishlist/WishlistPanel';
import { useTheme } from '@/hooks/useTheme';
import { useSongs } from '@/hooks/useSongs';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useDisplaySongs } from '@/hooks/useDisplaySongs';
import { useWishlist } from '@/hooks/useWishlist';
import styles from './App.module.css';

export default function App() {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { songs, allSongs, isLoading, sortField, setSortField } = useSongs();
  const featureFlags = useFeatureFlags();
  const [isWishlistOpen, setIsWishlistOpen] = useState(false);
  const [isToolbarHidden, setIsToolbarHidden] = useState(false);
  const handleScrollHide = useCallback((hidden: boolean) => setIsToolbarHidden(hidden), []);
  const { wishlistedIds, toggleSong, removeSong, clearAll, fabPosition, saveFabPosition } =
    useWishlist();

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
          <div className={`${styles.toolbar}${isToolbarHidden ? ` ${styles.toolbarHidden}` : ''}`}>
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
          </div>
          <SongList
            songs={displaySongs}
            isLoading={isLoading}
            sortField={sortField}
            onSortChange={setSortField}
            wishlistedIds={featureFlags.wishlist ? wishlistedIds : undefined}
            onToggleWishlist={featureFlags.wishlist ? toggleSong : undefined}
            isToolbarHidden={isToolbarHidden}
            onScrollHide={handleScrollHide}
          />
        </div>
      </main>

      {featureFlags.wishlist && (
        <>
          {wishlistedIds.length > 0 && !isWishlistOpen && (
            <WishlistFAB
              count={wishlistedIds.length}
              position={fabPosition}
              onOpen={() => setIsWishlistOpen(true)}
              onPositionChange={saveFabPosition}
            />
          )}
          <WishlistPanel
            isOpen={isWishlistOpen}
            onClose={() => setIsWishlistOpen(false)}
            songs={songs
              .filter((s) => wishlistedIds.includes(s.id))
              .sort((a, b) => wishlistedIds.indexOf(a.id) - wishlistedIds.indexOf(b.id))}
            onDelete={removeSong}
            onClearAll={clearAll}
          />
        </>
      )}
    </div>
  );
}
