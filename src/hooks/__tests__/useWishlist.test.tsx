import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWishlist } from '../useWishlist';

function mockLocalStorage() {
  const store = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => store.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => store.set(key, value)),
    removeItem: vi.fn((key: string) => store.delete(key)),
    clear: vi.fn(() => store.clear()),
  };

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
}

function TestHarness() {
  const { wishlistedIds, toggleSong, fabPosition } = useWishlist();

  return (
    <>
      <div role="toolbar" />
      <button type="button" onClick={() => toggleSong('song-1')}>
        toggle
      </button>
      <output data-testid="count">{wishlistedIds.length}</output>
      <output data-testid="position">
        {fabPosition.x},{fabPosition.y}
      </output>
    </>
  );
}

describe('useWishlist', () => {
  beforeEach(() => {
    mockLocalStorage();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1480 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 900 });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.getAttribute('role') === 'toolbar') {
        return {
          left: 260,
          top: 144,
          width: 960,
          height: 54,
          right: 1220,
          bottom: 198,
          x: 260,
          y: 144,
          toJSON: () => {},
        };
      }

      return {
        left: 0,
        top: 0,
        width: 0,
        height: 0,
        right: 0,
        bottom: 0,
        x: 0,
        y: 0,
        toJSON: () => {},
      };
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('places the first wishlist button near the desktop toolbar', async () => {
    render(<TestHarness />);

    fireEvent.click(screen.getByText('toggle'));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    await waitFor(() => expect(screen.getByTestId('position')).toHaveTextContent('930,134'));
  });

  it('keeps the existing mobile default position', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });

    render(<TestHarness />);

    fireEvent.click(screen.getByText('toggle'));

    expect(screen.getByTestId('count')).toHaveTextContent('1');
    await waitFor(() => expect(screen.getByTestId('position')).toHaveTextContent('318,772'));
  });
});
