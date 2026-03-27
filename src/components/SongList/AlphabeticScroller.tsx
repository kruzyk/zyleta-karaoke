import { useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Song, SortField } from '@/types/song';
import { stripLeadingQuote } from '@/utils/sort-key';
import styles from './AlphabeticScroller.module.css';

interface AlphabeticScrollerProps {
  songs: Song[];
  sortField: SortField;
  topVisibleIndex: number;
  onScrollToIndex: (index: number) => void;
}

const ALL_LETTERS = [
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

// Minimum pixel height per letter slot — below this letters start overlapping
const MIN_SLOT_PX = 13;

function getSortKey(song: Song, sortField: SortField): string {
  const raw = sortField === 'artist' ? song.artist : song.title;
  return stripLeadingQuote(raw).toUpperCase();
}

export function AlphabeticScroller({
  songs,
  sortField,
  topVisibleIndex,
  onScrollToIndex,
}: AlphabeticScrollerProps) {
  const { t } = useTranslation();
  const navRef = useRef<HTMLElement>(null);
  const [navHeight, setNavHeight] = useState(0);
  const [dragLetter, setDragLetter] = useState<string | null>(null);
  const [isCoarse, setIsCoarse] = useState<boolean>(
    () => window.matchMedia('(pointer: coarse)').matches,
  );

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
  // When bar is short we thin the alphabet (every 2nd, every 3rd …)
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
    const ro = new ResizeObserver((entries) => {
      setNavHeight(entries[0].contentRect.height);
    });
    ro.observe(nav); // eslint-disable-line react-you-might-not-need-an-effect/no-initialize-state
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const handler = (e: MediaQueryListEvent) => setIsCoarse(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Derive active letter from the virtualizer-provided top visible index.
  // No DOM querying needed — SongList passes topVisibleIndex directly.
  const activeLetter = useMemo(() => {
    let active: string | null = null;
    for (const [letter, firstIdx] of sortedLetterEntries) {
      if (firstIdx <= topVisibleIndex) active = letter;
      else break;
    }
    return active;
  }, [sortedLetterEntries, topVisibleIndex]);

  if (songs.length <= 20) return null;

  // Track mode: coarse pointer and 44px-tall buttons would overflow the nav
  const isTrackMode = isCoarse && navHeight > 0 && navHeight / 44 < ALL_LETTERS.length;
  const thumbPct =
    activeLetter !== null
      ? (ALL_LETTERS.indexOf(activeLetter) / (ALL_LETTERS.length - 1)) * 100
      : 0;

  // Given a target letter, find the nearest available letter (true nearest-neighbor).
  // Checks both directions at the same distance d simultaneously.
  const findNearestAvailable = (targetLetter: string): number | undefined => {
    if (letterMap.has(targetLetter)) return letterMap.get(targetLetter);
    const ti = ALL_LETTERS.indexOf(targetLetter);
    for (let d = 1; d < ALL_LETTERS.length; d++) {
      const before = ALL_LETTERS[ti - d];
      const after = ALL_LETTERS[ti + d];
      const hasBefore = before !== undefined && letterMap.has(before);
      const hasAfter = after !== undefined && letterMap.has(after);
      if (hasBefore || hasAfter) {
        return hasBefore ? letterMap.get(before) : letterMap.get(after);
      }
    }
    return undefined;
  };

  // Maps pointer Y to a letter, shows drag badge, and triggers navigation.
  // Track mode maps across ALL_LETTERS; letter mode maps across the thinned visibleLetters.
  const navigateToY = (clientY: number) => {
    const nav = navRef.current;
    if (!nav) return;
    const { top, height } = nav.getBoundingClientRect();
    const ratio = Math.max(0, Math.min((clientY - top) / height, 1));
    const letters = isTrackMode ? ALL_LETTERS : visibleLetters;
    const idx = Math.round(ratio * (letters.length - 1));
    const letter = letters[idx];
    setDragLetter(letter);
    const songIdx = findNearestAvailable(letter);
    if (songIdx !== undefined) onScrollToIndex(songIdx);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    navigateToY(e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLElement>) => {
    if (!e.buttons) return;
    navigateToY(e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLElement>) => {
    e.currentTarget.releasePointerCapture(e.pointerId);
    setDragLetter(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (!isTrackMode) return;
    const currentIdx = activeLetter !== null ? ALL_LETTERS.indexOf(activeLetter) : 0;
    let targetIdx: number | undefined;
    if (e.key === 'ArrowDown') targetIdx = currentIdx + 1;
    else if (e.key === 'ArrowUp') targetIdx = currentIdx - 1;
    else if (e.key === 'Home') targetIdx = 0;
    else if (e.key === 'End') targetIdx = ALL_LETTERS.length - 1;
    else return;
    e.preventDefault();
    const clampedIdx = Math.max(0, Math.min(targetIdx, ALL_LETTERS.length - 1));
    const letter = ALL_LETTERS[clampedIdx];
    const songIdx = findNearestAvailable(letter);
    if (songIdx !== undefined) onScrollToIndex(songIdx);
  };

  return (
    <nav
      ref={navRef}
      className={styles.scroller}
      aria-label={t('alphabeticScroller.navLabel')}
      tabIndex={isTrackMode ? 0 : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
    >
      <span className={styles.srOnly} aria-live="polite" aria-atomic="true">
        {activeLetter ? t('alphabeticScroller.currentSection', { letter: activeLetter }) : ''}
      </span>
      {/* Badge: always visible in track mode (active or drag), only during drag in letter mode */}
      {(isTrackMode ? (dragLetter ?? activeLetter) : dragLetter) && (
        <span className={styles.dragBadge} aria-hidden="true">
          {dragLetter ?? activeLetter}
        </span>
      )}

      {isTrackMode ? (
        <>
          <div className={styles.track} aria-hidden="true">
            {ALL_LETTERS.map((letter, i) =>
              letterMap.has(letter) ? (
                <div
                  key={letter}
                  className={styles.trackTick}
                  style={{ top: `${(i / (ALL_LETTERS.length - 1)) * 100}%` }}
                />
              ) : null,
            )}
          </div>
          {activeLetter !== null && (
            <div className={styles.trackThumb} style={{ top: `${thumbPct}%` }} aria-hidden="true" />
          )}
        </>
      ) : (
        visibleLetters.map((letter) => {
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
              aria-label={t('alphabeticScroller.scrollTo', { letter })}
              type="button"
            >
              {letter}
            </button>
          );
        })
      )}
    </nav>
  );
}
