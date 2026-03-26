import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslation } from 'react-i18next';
import type { Song, SortField } from '@/types/song';
import { SongItem } from './SongItem';
import { Spinner } from '../common/Spinner';
import styles from './SongList.module.css';

interface SongListProps {
  songs: Song[];
  isLoading: boolean;
  sortField: SortField;
  onSortChange: (field: SortField) => void;
}

export function SongList({ songs, isLoading, sortField, onSortChange }: SongListProps) {
  const { t } = useTranslation();
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: songs.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 56,
    overscan: 15,
  });

  if (isLoading) {
    return (
      <div className={styles.stateContainer}>
        <Spinner />
        <p>{t('songList.loading')}</p>
      </div>
    );
  }

  if (songs.length === 0) {
    return (
      <div className={styles.stateContainer}>
        <p className={styles.noResults} aria-live="polite">
          {t('songList.noResults')}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.sortBar} role="toolbar" aria-label={t('songList.sortLabel')}>
        <span className={styles.sortLabel}>{t('songList.sortLabel')}:</span>
        <button
          className={`${styles.sortButton} ${sortField === 'artist' ? styles.sortActive : ''}`}
          onClick={() => onSortChange('artist')}
          aria-pressed={sortField === 'artist'}
        >
          {t('songList.sortByArtist')}
        </button>
        <button
          className={`${styles.sortButton} ${sortField === 'title' ? styles.sortActive : ''}`}
          onClick={() => onSortChange('title')}
          aria-pressed={sortField === 'title'}
        >
          {t('songList.sortByTitle')}
        </button>
      </div>

      <div
        ref={parentRef}
        className={styles.scrollContainer}
        role="list"
        aria-label={t('songList.ariaLabel')}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: '100%',
            position: 'relative',
          }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
            >
              <SongItem song={songs[virtualItem.index]} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
