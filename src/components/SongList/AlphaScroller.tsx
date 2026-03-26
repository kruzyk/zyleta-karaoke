import { useMemo } from 'react';
import type { Song, SortField } from '@/types/song';
import styles from './AlphaScroller.module.css';

interface AlphaScrollerProps {
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

export function AlphaScroller({ songs, sortField, scrollContainerRef, estimatedItemHeight }: AlphaScrollerProps) {
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
    <div
      className={styles.scroller}
      onTouchMove={handleTouchMove}
    >
      {LETTERS.map((letter) => {
        const hasMatch = letterMap.has(letter);
        return (
          <span
            key={letter}
            data-letter={letter}
            className={`${styles.letter} ${!hasMatch ? styles.letterDisabled : ''}`}
            onClick={hasMatch ? () => scrollToLetter(letter) : undefined}
          >
            {letter}
          </span>
        );
      })}
    </div>
  );
}
