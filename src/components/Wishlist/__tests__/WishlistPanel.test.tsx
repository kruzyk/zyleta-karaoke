import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WishlistPanel } from '../WishlistPanel';
import type { Song } from '@/types/song';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key,
  }),
}));

const songs: Song[] = [
  { id: '1', title: 'Bohemian Rhapsody', artist: 'Queen' },
  { id: '2', title: 'Hotel California', artist: 'Eagles' },
];

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  songs,
  onDelete: vi.fn(),
  onClearAll: vi.fn(),
};

describe('WishlistPanel — renders song list', () => {
  it('renders all wishlist songs when panel is open', () => {
    render(<WishlistPanel {...defaultProps} />);
    expect(screen.getByText('Queen')).toBeInTheDocument();
    expect(screen.getByText('Eagles')).toBeInTheDocument();
  });

  it('renders empty state when no songs', () => {
    render(<WishlistPanel {...defaultProps} songs={[]} />);
    expect(screen.getByText('wishlist.emptyState')).toBeInTheDocument();
  });

  it('renders nothing when panel is not open', () => {
    const { container } = render(<WishlistPanel {...defaultProps} isOpen={false} />);
    expect(container.firstChild).toBeNull();
  });
});

describe('WishlistPanel — no sort mode', () => {
  it('should NOT have a sort-mode toggle button', () => {
    // RED before D&D removal: sort button exists (aria-pressed).
    // GREEN after removal: no aria-pressed button in the header.
    render(<WishlistPanel {...defaultProps} />);
    const sortButton = document.querySelector('button[aria-pressed]');
    expect(sortButton).toBeNull();
  });
});
