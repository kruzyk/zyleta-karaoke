import { useMemo } from 'react';
import type { Song, SortField } from '@/types/song';
import styles from './AlphabeticScroller.module.css';

interface AlphabeticScrollerProps {
  songs: Song[];
  sortField: SortField;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  estimatedItemHeight: number;
}

const LETTERS = ['#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z'];

function getSortKey(song: Song, sortField: SortField): string {
  const raw = sortField === 'artist' ? song.artist : song.title;
  return raw.replace(/^['"\u2018\u201C]/, '').toUpperCase();
}

export function AlphabeticScroller({ songs, sortField, scrollContainerRef, estimatedItemHeight }: AlphabeticScrollerProps) {
  const letterMap = useMemo(() => {
    const map = new Map<string, number>();
    songs.forEach((song, i) => {
      const key = getSortKey(song, sortField);
      const letter = /^[A-Z]/.test(key) ? key[0] : '#';
      if (!map.has(letter)) map.set(letter, i);
    });
    return map;
  }, [songs, sortField]);

  if (songs.length <= 50) return null;

  const scrollToLetter = (letter: string) => {
    const index = letterMap.get(letter);
    if (index === undefined) return;
    scrollContainerRef.current?.scrollTo({
      top: index * estimatedItemHeight,
      behavior: 'smooth',
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY);
    const letter = el?.getAttribute('data-letter');
    if (letter) scrollToLetter(letter);
  };

  return (
    <nav
      className={styles.scroller}
      aria-label="Alphabetic navigation"
      onTouchMove={handleTouchMove}
    >
      {LETTERS.map((letter, i) => {
        const hasMatch = letterMap.has(letter);
        return (
          <div key={letter} className={styles.letterGroup}>
            {i > 0 && <span className={styles.dot} aria-hidden="true">·</span>}
            <button
              data-letter={letter}
              className={`${styles.letter} ${!hasMatch ? styles.letterDisabled : ''}`}
              onClick={hasMatch ? () => scrollToLetter(letter) : undefined}
              disabled={!hasMatch}
              aria-label={`Scroll to ${letter}`}
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
