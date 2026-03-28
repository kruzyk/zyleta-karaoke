import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { Song } from '@/types/song';
import styles from './SongItem.module.css';

interface SongItemProps {
  song: Song;
  isInWishlist?: boolean;
  onToggleWishlist?: () => void;
}

export const SongItem = memo(function SongItem({
  song,
  isInWishlist = false,
  onToggleWishlist,
}: SongItemProps) {
  const { t } = useTranslation();

  return (
    <div className={`${styles.item} ${isInWishlist ? styles.itemInWishlist : ''}`} role="listitem">
      <span className={styles.songText}>
        {song.artist ? (
          <>
            <span className={styles.artist}>{song.artist}</span>
            <span className={styles.separator}> — </span>
          </>
        ) : null}
        <span className={styles.title}>{song.title}</span>
      </span>
      {onToggleWishlist !== undefined && (
        <button
          className={`${styles.toggleButton} ${isInWishlist ? styles.toggleButtonActive : ''}`}
          onClick={onToggleWishlist}
          aria-pressed={isInWishlist}
          aria-label={isInWishlist ? t('wishlist.removeFromList') : t('wishlist.addToList')}
          type="button"
        >
          {isInWishlist ? '✓' : '+'}
        </button>
      )}
    </div>
  );
});
