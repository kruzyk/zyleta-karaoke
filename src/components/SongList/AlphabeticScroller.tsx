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

const ALL_LETTERS = [
  '#', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
  'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z',
];

// Minimum pixel height per letter slot — below this letters start overlapping
const MIN_SLOT_PX = 13;

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
  const navRef = useRef<HTMLElement>(null);
  const [navHeight, setNavHeight] = useState(0);
  const [activeLetter, setActiveLetter] = useState<string | null>(null);

  // letter → index of first song with that starting letter
  const letterMap = useMemo(() => {
    const map = new Map<string, number>();
    songs.forEach((song, i) => {
      const key = getSortKey(song, sortField);
      const letter = /^[A-Z]/.test(key) ? key[0] : '#';
      if (!map.has(letter)) map.set(letter, i);
    });
    return map;
  }, [songs, sortField]);

  // sorted entries used for active-letter tracking
  const sortedLetterEntries = useMemo(
    () => [...letterMap.entries()].sort((a, b) => a[1] - b[1]),
    [letterMap],
  );

  // Subset of ALL_LETTERS that fits the available height.
  // When bar is short we thin the alphabet (every 2nd, every 3rd …) —
  // same strategy as index-scrollbar's checkVisibleLetters().
  const visibleLetters = useMemo(() => {
    if (navHeight === 0) return ALL_LETTERS;
    const maxSlots = Math.floor(navHeight / MIN_SLOT_PX);
    if (maxSlots >= ALL_LETTERS.length) return ALL_LETTERS;
    const step = Math.ceil(ALL_LETTERS.length / Math.max(1, maxSlots));
    return ALL_LETTERS.filter((_, i) => i % step === 0);
  }, [navHeight]);

  // Track nav height so visibleLetters adapts on resize
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const ro = new ResizeObserver(entries => {
      setNavHeight(entries[0].contentRect.height);
    });
    ro.observe(nav);
    setNavHeight(nav.clientHeight);
    return () => ro.disconnect();
  }, []);

  // Active-letter indicator: which letter section is currently in view
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      const idx = Math.floor(el.scrollTop / estimatedItemHeight);
      let active: string | null = null;
      for (const [letter, firstIdx] of sortedLetterEntries) {
        if (firstIdx <= idx) active = letter;
        else break;
      }
      setActiveLetter(active);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [sortedLetterEntries, estimatedItemHeight, scrollContainerRef]);

  if (songs.length <= 50) return null;

  // Given a target letter (from Y position), find the nearest available letter.
  // Mirrors index-scrollbar's getClosestValidLetterIndex() approach.
  const findNearestAvailable = (targetLetter: string): number | undefined => {
    if (letterMap.has(targetLetter)) return letterMap.get(targetLetter);
    const ti = ALL_LETTERS.indexOf(targetLetter);
    for (let d = 1; d < ALL_LETTERS.length; d++) {
      const before = ALL_LETTERS[ti - d];
      if (before && letterMap.has(before)) return letterMap.get(before);
      const after = ALL_LETTERS[ti + d];
      if (after && letterMap.has(after)) return letterMap.get(after);
    }
    return undefined;
  };

  // Maps pointer Y to a letter and triggers navigation.
  // Core formula from index-scrollbar: ratio * (letters.length - 1)
  const navigateToY = (clientY: number) => {
    const nav = navRef.current;
    if (!nav) return;
    const { top, height } = nav.getBoundingClientRect();
    const ratio = Math.max(0, Math.min((clientY - top) / height, 1));
    const idx = Math.round(ratio * (visibleLetters.length - 1));
    const letter = visibleLetters[idx];
    const songIdx = findNearestAvailable(letter);
    if (songIdx !== undefined) onScrollToIndex(songIdx);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // Capture so pointermove continues even if finger leaves the bar
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
      {visibleLetters.map((letter) => {
        const hasMatch = letterMap.has(letter);
        const isActive = letter === activeLetter;
        return (
          <button
            key={letter}
            className={`${styles.letter} ${!hasMatch ? styles.letterDisabled : ''} ${isActive ? styles.letterActive : ''}`}
            // onClick fires for keyboard (Enter/Space); pointer nav is handled at nav level
            onClick={hasMatch ? () => onScrollToIndex(letterMap.get(letter)!) : undefined}
            disabled={!hasMatch}
            tabIndex={hasMatch ? 0 : -1}
            aria-label={`Scroll to ${letter}`}
            aria-current={isActive ? 'true' : undefined}
            type="button"
          >
            {letter}
          </button>
        );
      })}
    </nav>
  );
}
