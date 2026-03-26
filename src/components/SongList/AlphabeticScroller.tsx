import { useMemo, useState, useEffect, useRef } from 'react';
import type { Song, SortField } from '@/types/song';
import styles from './AlphabeticScroller.module.css';

interface AlphabeticScrollerProps {
  songs: Song[];
  sortField: SortField;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  estimatedItemHeight: number;
  onScrollToIndex: (index: number) => void;
}

const LETTERS = ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

function getSortKey(song: Song, sortField: SortField): string {
  const raw = sortField === 'artist' ? song.artist : song.title;
  return raw.replace(/^['"\u2018\u201C]/, '').toUpperCase();
}

export function AlphabeticScroller({
  songs,
  sortField,
  scrollContainerRef,
  estimatedItemHeight,
  onScrollToIndex,
}: AlphabeticScrollerProps) {
  const [activeLetter, setActiveLetter] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  const letterMap = useMemo(() => {
    const map = new Map<string, number>();
    songs.forEach((song, i) => {
      const key = getSortKey(song, sortField);
      const letter = /^[A-Z]/.test(key) ? key[0] : '#';
      if (!map.has(letter)) map.set(letter, i);
    });
    return map;
  }, [songs, sortField]);

  const sortedLetterEntries = useMemo(() => {
    return [...letterMap.entries()].sort((a, b) => a[1] - b[1]);
  }, [letterMap]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const currentIndex = Math.floor(el.scrollTop / estimatedItemHeight);
      let active: string | null = null;
      for (const [letter, index] of sortedLetterEntries) {
        if (index <= currentIndex) active = letter;
        else break;
      }
      setActiveLetter(active);
    };
    el.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => el.removeEventListener('scroll', handleScroll);
  }, [sortedLetterEntries, estimatedItemHeight, scrollContainerRef]);

  if (songs.length <= 50) return null;

  // Maps pointer Y position to the nearest letter and triggers scrollToIndex.
  // Core of the section-index-bar interaction: drag anywhere on the bar to navigate.
  const navigateToY = (clientY: number) => {
    const nav = navRef.current;
    if (!nav) return;
    const rect = nav.getBoundingClientRect();
    const ratio = Math.max(0, Math.min((clientY - rect.top) / rect.height, 1));
    const letterIndex = Math.min(Math.round(ratio * (LETTERS.length - 1)), LETTERS.length - 1);
    const songIndex = letterMap.get(LETTERS[letterIndex]);
    if (songIndex !== undefined) onScrollToIndex(songIndex);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // Capture so pointermove keeps firing even when dragging outside the bar
    e.currentTarget.setPointerCapture(e.pointerId);
    navigateToY(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!e.buttons) return;
    navigateToY(e.clientY);
  };

  return (
    <nav
      ref={navRef}
      className={styles.scroller}
      aria-label="Alphabetic navigation"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
    >
      {LETTERS.map((letter, i) => {
        const hasMatch = letterMap.has(letter);
        const isActive = letter === activeLetter;
        return (
          <div key={letter} className={styles.letterGroup}>
            {i > 0 && <span className={styles.dot} aria-hidden="true">·</span>}
            <button
              data-letter={letter}
              className={`${styles.letter} ${!hasMatch ? styles.letterDisabled : ''} ${isActive ? styles.letterActive : ''}`}
              onClick={hasMatch ? () => onScrollToIndex(letterMap.get(letter)!) : undefined}
              disabled={!hasMatch}
              aria-label={`Scroll to ${letter}`}
              aria-current={isActive ? 'true' : undefined}
              type="button"
            >
              {letter}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
