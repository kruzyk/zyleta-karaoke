import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AlphabeticScroller } from '../AlphabeticScroller';
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

type ResizeObserverCallback = (entries: ResizeObserverEntry[]) => void;

let resizeCallbacks: ResizeObserverCallback[] = [];

function stubResizeObserver(height = 0) {
  resizeCallbacks = [];
  global.ResizeObserver = class {
    constructor(cb: ResizeObserverCallback) {
      resizeCallbacks.push(cb);
    }
    observe(el: Element) {
      resizeCallbacks.forEach((cb) => cb([{ contentRect: { height } } as ResizeObserverEntry]));
    }
    disconnect() {}
    unobserve() {}
  };
}

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

beforeEach(() => {
  setPointerCoarse(false);
  stubResizeObserver(0);
});

// Helpers
function makeSongs(count: number): Song[] {
  return Array.from({ length: count }, (_, i) => ({
    id: String(i),
    artist: `Artysta ${i}`,
    title: `Song ${i}`,
  }));
}

function makeSongsAB(): Song[] {
  return [
    ...Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      artist: `Alpha ${i}`,
      title: `Song ${i}`,
    })),
    ...Array.from({ length: 15 }, (_, i) => ({
      id: String(10 + i),
      artist: `Bravo ${i}`,
      title: `Song ${10 + i}`,
    })),
  ];
}

// ─────────────────────────────────────────────
describe('AlphabeticScroller — basic rendering', () => {
  it('returns null when song count is 20 or fewer', () => {
    const { container } = render(
      <AlphabeticScroller
        songs={makeSongs(20)}
        sortField="artist"
        topVisibleIndex={0}
        onScrollToIndex={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the nav element when song count exceeds 20', () => {
    render(
      <AlphabeticScroller
        songs={makeSongs(25)}
        sortField="artist"
        topVisibleIndex={0}
        onScrollToIndex={vi.fn()}
      />,
    );
    expect(screen.getByRole('navigation')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────
describe('AlphabeticScroller — letter button clicks (fine pointer)', () => {
  it('calls onScrollToIndex with index 0 when clicking the active letter button', async () => {
    const user = userEvent.setup();
    const onScrollToIndex = vi.fn();

    render(
      <AlphabeticScroller
        songs={makeSongs(25)}
        sortField="artist"
        topVisibleIndex={0}
        onScrollToIndex={onScrollToIndex}
      />,
    );

    // All songs start with 'A', so the A button is enabled
    const aButton = screen.getByRole('button', { name: 'Go to A' });
    await user.click(aButton);

    expect(onScrollToIndex).toHaveBeenCalledWith(0);
  });

  it('marks letters with no matching songs as disabled and not keyboard-focusable', () => {
    render(
      <AlphabeticScroller
        songs={makeSongs(25)}
        sortField="artist"
        topVisibleIndex={0}
        onScrollToIndex={vi.fn()}
      />,
    );

    const zButton = screen.getByRole('button', { name: 'Go to Z' });
    expect(zButton).toBeDisabled();
    expect(zButton).toHaveAttribute('tabindex', '-1');
  });
});

// ─────────────────────────────────────────────
describe('AlphabeticScroller — active letter indicator', () => {
  it('marks the A button active when topVisibleIndex is 0', () => {
    render(
      <AlphabeticScroller
        songs={makeSongsAB()}
        sortField="artist"
        topVisibleIndex={0}
        onScrollToIndex={vi.fn()}
      />,
    );

    const aButton = screen.getByRole('button', { name: 'Go to A' });
    expect(aButton).toHaveClass(/letterActive/);
  });

  it('marks the B button active when topVisibleIndex enters the B group', () => {
    render(
      <AlphabeticScroller
        songs={makeSongsAB()}
        sortField="artist"
        topVisibleIndex={10}
        onScrollToIndex={vi.fn()}
      />,
    );

    const bButton = screen.getByRole('button', { name: 'Go to B' });
    expect(bButton).toHaveClass(/letterActive/);
  });

  it('updates the active letter when topVisibleIndex changes', () => {
    const { rerender } = render(
      <AlphabeticScroller
        songs={makeSongsAB()}
        sortField="artist"
        topVisibleIndex={0}
        onScrollToIndex={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Go to A' })).toHaveClass(/letterActive/);

    rerender(
      <AlphabeticScroller
        songs={makeSongsAB()}
        sortField="artist"
        topVisibleIndex={10}
        onScrollToIndex={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Go to B' })).toHaveClass(/letterActive/);
    expect(screen.getByRole('button', { name: 'Go to A' })).not.toHaveClass(/letterActive/);
  });
});

// ─────────────────────────────────────────────
describe('AlphabeticScroller — keyboard navigation (track mode)', () => {
  beforeEach(() => {
    setPointerCoarse(true);
    // Provide a tall nav so track mode activates (navHeight / 44 < 27 letters)
    stubResizeObserver(600);
  });

  it('ArrowDown from A navigates to the B group', async () => {
    const user = userEvent.setup();
    const onScrollToIndex = vi.fn();

    render(
      <AlphabeticScroller
        songs={makeSongsAB()}
        sortField="artist"
        topVisibleIndex={0}
        onScrollToIndex={onScrollToIndex}
      />,
    );

    const nav = screen.getByRole('navigation');
    nav.focus();
    await user.keyboard('{ArrowDown}');

    // A is ALL_LETTERS[1], B is ALL_LETTERS[2].
    // ArrowDown from A (index 1) → B (index 2). B is available at song index 10.
    expect(onScrollToIndex).toHaveBeenCalledWith(10);
  });

  it('ArrowUp from B navigates back to the A group', async () => {
    const user = userEvent.setup();
    const onScrollToIndex = vi.fn();

    render(
      <AlphabeticScroller
        songs={makeSongsAB()}
        sortField="artist"
        topVisibleIndex={10}
        onScrollToIndex={onScrollToIndex}
      />,
    );

    const nav = screen.getByRole('navigation');
    nav.focus();
    await user.keyboard('{ArrowUp}');

    // ArrowUp from B (index 2) → A (index 1). A starts at song index 0.
    expect(onScrollToIndex).toHaveBeenCalledWith(0);
  });
});
