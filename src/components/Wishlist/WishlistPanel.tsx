import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Song } from '@/types/song';
import { WishlistItem } from './WishlistItem';
import styles from './WishlistPanel.module.css';

interface WishlistPanelProps {
  isOpen: boolean;
  onClose: () => void;
  songs: Song[];
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function WishlistPanel({
  isOpen,
  onClose,
  songs,
  onDelete,
  onClearAll,
}: WishlistPanelProps) {
  const { t } = useTranslation();
  const [isMounted, setIsMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [revealedId, setRevealedId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const prevIsOpenRef = useRef(isOpen);
  const prevIsOpen = prevIsOpenRef.current;
  prevIsOpenRef.current = isOpen;

  if (isOpen && !isMounted) setIsMounted(true);
  if (!prevIsOpen && isOpen && isClosing) setIsClosing(false); // re-opened while closing animation played
  if (!isOpen && isMounted && !isClosing) setIsClosing(true);

  const handleClose = useCallback(() => {
    setIsClosing(true);
  }, []);

  const handleAnimationEnd = useCallback(() => {
    if (isClosing) {
      setIsMounted(false);
      setIsClosing(false);
      onClose();
    }
  }, [isClosing, onClose]);

  const handleClearAll = useCallback(() => {
    const confirmed = window.confirm(t('wishlist.clearAllConfirm'));
    if (confirmed) {
      onClearAll();
    }
  }, [t, onClearAll]);

  useEffect(() => {
    if (!isMounted) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isMounted, handleClose]);

  if (!isMounted) return null;

  return (
    <div
      ref={panelRef}
      className={`${styles.panel} ${isClosing ? styles.panelClosing : ''}`}
      onAnimationEnd={handleAnimationEnd}
      autoFocus
      role="dialog"
      aria-modal="true"
      aria-label={t('wishlist.panelTitle')}
      tabIndex={-1}
    >
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <h2 className={styles.title}>{t('wishlist.panelTitle')}</h2>
          <span className={styles.count}>{t('wishlist.itemCount', { count: songs.length })}</span>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.headerButton}
            onClick={handleClose}
            aria-label={t('wishlist.closePanel')}
            type="button"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* List */}
      <div
        className={styles.list}
        role="list"
        aria-label={t('wishlist.panelTitle')}
        onScroll={() => setRevealedId(null)}
      >
        {songs.length === 0 ? (
          <p className={styles.emptyState}>{t('wishlist.emptyState')}</p>
        ) : (
          songs.map((song) => (
            <WishlistItem
              key={song.id}
              song={song}
              onDelete={() => onDelete(song.id)}
              isForceClose={revealedId !== song.id}
              onReveal={() => setRevealedId(song.id)}
              onTap={() => setRevealedId(null)}
            />
          ))
        )}
      </div>

      {/* Footer */}
      {songs.length > 0 && (
        <div className={styles.footer}>
          <button className={styles.clearButton} onClick={handleClearAll} type="button">
            {t('wishlist.clearAll')}
          </button>
        </div>
      )}
    </div>
  );
}
