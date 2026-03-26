import { useMemo, useState, useEffect } from 'react';
import type { Song, SortField } from '@/types/song';
import styles from './AlphabeticScroller.module.css';

interface AlphabeticScrollerProps {
  songs: Song[];
  sortField: SortField;
  scrollContainerRef: React.RefObject<HTMLDivElement>;
  estimatedItemHeight: number;
  onScrollToIndex: (index: number) => void;
}

const LETTERS = [
  '#',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
  'P',
  'Q',
  'R',
  'S',
  'T',
  'U',
  'V',
  'W',
  'X',
  'Y',
  'Z',
];

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

  const scrollToLetter = (letter: string) => {
    const index = letterMap.get(letter);
    if (index === undefined) return;
    onScrollToIndex(index);
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
        const isActive = letter === activeLetter;
        return (
          <div key={letter} className={styles.letterGroup}>
            {i > 0 && (
              <span className={styles.dot} aria-hidden="true">
                ·
              </span>
            )}
            <button
              data-letter={letter}
              className={`${styles.letter} ${!hasMatch ? styles.letterDisabled : ''} ${isActive ? styles.letterActive : ''}`}
              onClick={hasMatch ? () => scrollToLetter(letter) : undefined}
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
