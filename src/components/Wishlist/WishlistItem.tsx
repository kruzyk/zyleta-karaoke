import { useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { Song } from '@/types/song';
import styles from './WishlistItem.module.css';

interface WishlistItemProps {
  song: Song;
  onDelete: () => void;
  isForceClose?: boolean;
  onReveal?: () => void;
  onTap?: () => void;
}

const REVEAL_THRESHOLD = 48;
const MAX_REVEAL = 96;
const IS_MOUSE_DEVICE =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: fine)').matches;

export function WishlistItem({ song, onDelete, isForceClose, onReveal, onTap }: WishlistItemProps) {
  const { t } = useTranslation();
  const [translateX, setTranslateX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const swipeActiveRef = useRef(false);
  const scrollLockedRef = useRef(false);

  if (isForceClose && isRevealed) {
    setTranslateX(0);
    setIsRevealed(false);
  }

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (IS_MOUSE_DEVICE) return;
    startXRef.current = e.clientX;
    startYRef.current = e.clientY;
    swipeActiveRef.current = false;
    scrollLockedRef.current = false;
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.buttons === 0) return;
      if (scrollLockedRef.current) return;

      const dx = startXRef.current - e.clientX;
      const dy = Math.abs(e.clientY - startYRef.current);

      if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;

      if (!swipeActiveRef.current) {
        if (Math.hypot(dx, dy) < 12) return;
        if (dy > Math.abs(dx) * 1.4) {
          // Vertical scroll intent — lock out swipe and immediately snap back if revealed
          scrollLockedRef.current = true;
          if (isRevealed) {
            setTranslateX(0);
            setIsRevealed(false);
            onTap?.();
          }
          return;
        }
        // Horizontal intent confirmed — reset origin so translateX starts from 0 (no flash)
        swipeActiveRef.current = true;
        startXRef.current = e.clientX;
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsDragging(true);
        return;
      }

      const base = isRevealed ? MAX_REVEAL : 0;
      const raw = base + (startXRef.current - e.clientX);
      setTranslateX(Math.max(0, Math.min(raw, MAX_REVEAL)));
    },
    [isRevealed, onTap],
  );

  const handlePointerUp = useCallback(() => {
    if (!swipeActiveRef.current) return;
    swipeActiveRef.current = false;
    setIsDragging(false);
    if (translateX > REVEAL_THRESHOLD) {
      setTranslateX(MAX_REVEAL);
      setIsRevealed(true);
      onReveal?.();
    } else {
      setTranslateX(0);
      setIsRevealed(false);
    }
  }, [translateX, onReveal]);

  const handlePointerCancel = useCallback(() => {
    swipeActiveRef.current = false;
    scrollLockedRef.current = false;
    setIsDragging(false);
    setTranslateX(0);
    setIsRevealed(false);
  }, []);

  const handleDeleteClick = useCallback(() => {
    setTranslateX(0);
    setIsRevealed(false);
    onDelete();
  }, [onDelete]);

  const handleItemClick = useCallback(() => {
    if (isRevealed) {
      setTranslateX(0);
      setIsRevealed(false);
    }
    onTap?.();
  }, [isRevealed, onTap]);

  return (
    <div className={styles.wrapper} role="listitem">
      <div className={styles.deleteZone} aria-hidden={IS_MOUSE_DEVICE ? undefined : 'true'}>
        <button
          className={styles.deleteButton}
          onClick={handleDeleteClick}
          tabIndex={IS_MOUSE_DEVICE || isRevealed ? 0 : -1}
          type="button"
          aria-label={t('wishlist.deleteItem')}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            <path d="M10 11v6" />
            <path d="M14 11v6" />
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
          </svg>
        </button>
      </div>

      <div
        className={`${styles.content}${isDragging ? ` ${styles.contentDragging}` : ''}`}
        style={{
          transform: `translateX(-${translateX}px)`,
          transition: isDragging ? 'none' : 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleItemClick}
      >
        <div className={styles.songInfo}>
          {song.artist ? (
            <>
              <span className={styles.artist}>{song.artist}</span>
              <span className={styles.separator}> — </span>
            </>
          ) : null}
          <span className={styles.title}>{song.title}</span>
        </div>
      </div>
    </div>
  );
}
