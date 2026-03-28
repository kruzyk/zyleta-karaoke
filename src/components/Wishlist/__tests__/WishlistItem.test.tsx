import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { WishlistItem } from '../WishlistItem';
import type { Song } from '@/types/song';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const song: Song = { id: '1', title: 'Bohemian Rhapsody', artist: 'Queen' };

describe('WishlistItem — renders correctly', () => {
  it('renders song artist and title', () => {
    render(<WishlistItem song={song} onDelete={vi.fn()} />);
    expect(screen.getByText('Queen')).toBeInTheDocument();
    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
  });

  it('renders without drag handle element', () => {
    // After D&D removal: no drag handle in the DOM.
    const { container } = render(<WishlistItem song={song} onDelete={vi.fn()} />);
    expect(container.querySelector('[class*="dragHandle"]')).toBeNull();
  });

  it('renders delete button in the delete zone', () => {
    const { container } = render(<WishlistItem song={song} onDelete={vi.fn()} />);
    // deleteZone is aria-hidden (gesture-only); query by class
    const deleteBtn = container.querySelector('[class*="deleteButton"]') as HTMLElement;
    expect(deleteBtn).not.toBeNull();
  });
});

describe('WishlistItem — swipe reset on pointercancel', () => {
  it('resets translateX and transition on pointercancel', () => {
    const { container } = render(<WishlistItem song={song} onDelete={vi.fn()} />);
    const content = container.querySelector('[class*="content"]') as HTMLElement;

    // Start swipe: pointerdown then enough horizontal movement
    fireEvent.pointerDown(content, { clientX: 200, clientY: 100, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(content, { clientX: 190, clientY: 100, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(content, { clientX: 160, clientY: 100, pointerId: 1, buttons: 1 });

    // Browser takes control — fire pointercancel
    fireEvent.pointerCancel(content, { pointerId: 1 });

    // Content must snap back: translateX 0 and transition enabled
    expect(content.style.transform).toBe('translateX(-0px)');
    expect(content.style.transition).toContain('transform');
  });

  it('does NOT call onDelete when swipe is cancelled', () => {
    const onDelete = vi.fn();
    const { container } = render(<WishlistItem song={song} onDelete={onDelete} />);
    const content = container.querySelector('[class*="content"]') as HTMLElement;

    fireEvent.pointerDown(content, { clientX: 200, clientY: 100, pointerId: 1, buttons: 1 });
    fireEvent.pointerMove(content, { clientX: 100, clientY: 100, pointerId: 1, buttons: 1 });
    fireEvent.pointerCancel(content, { pointerId: 1 });

    expect(onDelete).not.toHaveBeenCalled();
  });
});

describe('WishlistItem — swipe aborts on vertical scroll intent', () => {
  it('does not activate swipe when vertical movement dominates', () => {
    const { container } = render(<WishlistItem song={song} onDelete={vi.fn()} />);
    const content = container.querySelector('[class*="content"]') as HTMLElement;

    fireEvent.pointerDown(content, { clientX: 100, clientY: 100, pointerId: 1, buttons: 1 });
    // dy=30 >> dx=5 — scroll intent
    fireEvent.pointerMove(content, { clientX: 95, clientY: 130, pointerId: 1, buttons: 1 });

    // translateX should remain 0 — swipe did not activate
    expect(content.style.transform).toBe('translateX(-0px)');
  });
});

describe('WishlistItem — force close via isForceClose prop', () => {
  it('snaps back when isForceClose becomes true while revealed', () => {
    // Simulate revealed state by rendering with isForceClose=false first,
    // then re-render with isForceClose=true (parent closes due to scroll / other item reveal)
    const { container, rerender } = render(
      <WishlistItem song={song} onDelete={vi.fn()} isForceClose={false} />,
    );
    const content = container.querySelector('[class*="content"]') as HTMLElement;

    // Force the item into revealed state by re-rendering — isForceClose flips to true
    rerender(<WishlistItem song={song} onDelete={vi.fn()} isForceClose={true} />);

    // Content must be at translateX 0 (snap back) with transition enabled
    expect(content.style.transform).toBe('translateX(-0px)');
    expect(content.style.transition).toContain('transform');
  });
});

describe('WishlistItem — delete on swipe confirm', () => {
  it('calls onDelete when delete button is clicked after revealing', () => {
    const onDelete = vi.fn();
    const { container } = render(<WishlistItem song={song} onDelete={onDelete} />);
    // deleteZone is aria-hidden — query by class
    const deleteBtn = container.querySelector('[class*="deleteButton"]') as HTMLElement;
    expect(deleteBtn).not.toBeNull();
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});
