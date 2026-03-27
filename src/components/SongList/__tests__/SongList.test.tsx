import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { SongList } from '../SongList';
import type { Song } from '@/types/song';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === 'alphabeticScroller.scrollTo') return `Go to ${opts?.letter}`;
      if (key === 'alphabeticScroller.currentSection') return `Section: ${opts?.letter}`;
      return key;
    },
  }),
}));

vi.mock('@tanstack/react-virtual');

// ── ResizeObserver stub (required by AlphabeticScroller) ───────────────────
let resizeCallbacks: ResizeObserverCallback[] = [];
function stubResizeObserver(height = 0) {
  resizeCallbacks = [];
  global.ResizeObserver = class {
    constructor(cb: ResizeObserverCallback) {
      resizeCallbacks.push(cb);
    }
    observe() {
      resizeCallbacks.forEach((cb) =>
        cb([{ contentRect: { height } } as ResizeObserverEntry], this),
      );
    }
    disconnect() {}
    unobserve() {}
  };
}

// ── matchMedia stub (required by AlphabeticScroller) ──────────────────────
function setPointerCoarse(coarse: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: query === '(pointer: coarse)' ? coarse : false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

// ── Virtualizer mock helpers ───────────────────────────────────────────────
interface FakeVirtualItem {
  index: number;
  start: number;
  end: number;
  size: number;
  key: number;
  lane: number;
}

const ITEM_HEIGHT = 56;

function makeVirtualItem(index: number): FakeVirtualItem {
  return {
    index,
    start: index * ITEM_HEIGHT,
    end: (index + 1) * ITEM_HEIGHT,
    size: ITEM_HEIGHT,
    key: index,
    lane: 0,
  };
}

function createMockVirtualizer({
  scrollOffset = 0,
  virtualItems = [] as FakeVirtualItem[],
  getVirtualItemForOffset = vi.fn<[number], FakeVirtualItem | undefined>(),
} = {}) {
  return {
    getVirtualItems: () => virtualItems,
    getTotalSize: () => 10_000,
    scrollToIndex: vi.fn(),
    measureElement: vi.fn(),
    scrollOffset,
    getVirtualItemForOffset,
  };
}

// ── Song factory ───────────────────────────────────────────────────────────
function makeSongsForLetter(letter: string, count: number, startId = 0): Song[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(startId + i),
    artist: `${letter}-artist-${startId + i}`,
    title: `Song ${startId + i}`,
  }));
}

beforeEach(() => {
  setPointerCoarse(false);
  stubResizeObserver(0);
  vi.mocked(useVirtualizer).mockReturnValue(
    createMockVirtualizer() as unknown as ReturnType<typeof useVirtualizer>,
  );
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SongList — topVisibleIndex: active letter accuracy', () => {
  // 100 songs starting with L (indices 0–99), 100 starting with M (indices 100–199)
  const songs: Song[] = [
    ...makeSongsForLetter('L', 100, 0),
    ...makeSongsForLetter('M', 100, 100),
  ];

  it('shows M as active when scrolled to M territory, even if virtualItems[0] is still in L (overscan bug)', () => {
    // Setup:
    //   - scrollOffset = 5600 → top of viewport is at item 100 (first M song)
    //   - virtualItems[0].index = 85 (15-item overscan places first *rendered* item in L territory)
    //   - getVirtualItemForOffset(5600) returns item 100 (correct first *visible* item)
    //
    // Bug behaviour  (before fix): topVisibleIndex = virtualItems[0].index = 85 → activeLetter = L ✗
    // Correct behaviour (after fix): topVisibleIndex = getVirtualItemForOffset(…).index = 100 → activeLetter = M ✓
    const scrollOffset = 100 * ITEM_HEIGHT;

    vi.mocked(useVirtualizer).mockReturnValue(
      createMockVirtualizer({
        scrollOffset,
        virtualItems: Array.from({ length: 30 }, (_, i) => makeVirtualItem(85 + i)),
        getVirtualItemForOffset: vi.fn().mockReturnValue(makeVirtualItem(100)),
      }) as unknown as ReturnType<typeof useVirtualizer>,
    );

    render(<SongList songs={songs} isLoading={false} sortField="artist" onSortChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Go to M' })).toHaveClass(/letterActive/);
    expect(screen.getByRole('button', { name: 'Go to L' })).not.toHaveClass(/letterActive/);
  });

  it('shows L as active when scrolled to the beginning of the list', () => {
    vi.mocked(useVirtualizer).mockReturnValue(
      createMockVirtualizer({
        scrollOffset: 0,
        virtualItems: Array.from({ length: 20 }, (_, i) => makeVirtualItem(i)),
        getVirtualItemForOffset: vi.fn().mockReturnValue(makeVirtualItem(0)),
      }) as unknown as ReturnType<typeof useVirtualizer>,
    );

    render(<SongList songs={songs} isLoading={false} sortField="artist" onSortChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Go to L' })).toHaveClass(/letterActive/);
    expect(screen.getByRole('button', { name: 'Go to M' })).not.toHaveClass(/letterActive/);
  });

  it('falls back to index 0 when getVirtualItemForOffset returns undefined', () => {
    // Edge case: virtualizer not yet initialised (scrollOffset = 0, no items measured).
    // Should default to index 0 without throwing.
    vi.mocked(useVirtualizer).mockReturnValue(
      createMockVirtualizer({
        scrollOffset: 0,
        virtualItems: [makeVirtualItem(0)],
        getVirtualItemForOffset: vi.fn().mockReturnValue(undefined),
      }) as unknown as ReturnType<typeof useVirtualizer>,
    );

    render(<SongList songs={songs} isLoading={false} sortField="artist" onSortChange={vi.fn()} />);

    // Index 0 belongs to L — scroller should default to L, not crash
    expect(screen.getByRole('button', { name: 'Go to L' })).toHaveClass(/letterActive/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('SongList — virtualizer configuration', () => {
  it('uses overscan: 5 to reduce main-thread work during fast scroll on mobile', () => {
    // overscan: 15 caused momentum scroll to be interrupted on mobile devices
    // because mounting/unmounting up to 30 items per scroll event blocked the JS thread.
    render(
      <SongList
        songs={makeSongsForLetter('A', 25)}
        isLoading={false}
        sortField="artist"
        onSortChange={vi.fn()}
      />,
    );

    const options = vi.mocked(useVirtualizer).mock.calls[0][0];
    expect(options.overscan).toBe(5);
  });
});
