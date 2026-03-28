import { useState, useCallback, useEffect } from 'react';

const WISHLIST_KEY = 'zyleta-wishlist';
const FAB_KEY = 'zyleta-wishlist-fab';

const FAB_SIZE = 56;

interface FabPosition {
  x: number;
  y: number;
}

interface WishlistActions {
  wishlistedIds: string[];
  toggleSong: (id: string) => void;
  removeSong: (id: string) => void;
  clearAll: () => void;
  fabPosition: FabPosition;
  saveFabPosition: (x: number, y: number) => void;
}

function clampToViewport(x: number, y: number): FabPosition {
  return {
    x: Math.max(0, Math.min(x, window.innerWidth - FAB_SIZE)),
    y: Math.max(0, Math.min(y, window.innerHeight - FAB_SIZE)),
  };
}

function getDefaultFabPosition(): FabPosition {
  return {
    x: window.innerWidth - FAB_SIZE - 16,
    y: window.innerHeight - FAB_SIZE - 16,
  };
}

function readWishlist(): string[] {
  try {
    const stored = localStorage.getItem(WISHLIST_KEY);
    if (!stored) return [];
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

function readFabPosition(): FabPosition {
  try {
    const stored = localStorage.getItem(FAB_KEY);
    if (!stored) return getDefaultFabPosition();
    const parsed: unknown = JSON.parse(stored);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'x' in parsed &&
      'y' in parsed &&
      typeof (parsed as FabPosition).x === 'number' &&
      typeof (parsed as FabPosition).y === 'number'
    ) {
      return clampToViewport((parsed as FabPosition).x, (parsed as FabPosition).y);
    }
    return getDefaultFabPosition();
  } catch {
    return getDefaultFabPosition();
  }
}

export function useWishlist(): WishlistActions {
  const [wishlistedIds, setWishlistedIds] = useState<string[]>(readWishlist);
  const [fabPosition, setFabPosition] = useState<FabPosition>(readFabPosition);

  useEffect(() => {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlistedIds));
  }, [wishlistedIds]);

  const toggleSong = useCallback((id: string) => {
    setWishlistedIds((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id],
    );
  }, []);

  const removeSong = useCallback((id: string) => {
    setWishlistedIds((prev) => prev.filter((sid) => sid !== id));
  }, []);

  const clearAll = useCallback(() => {
    setWishlistedIds([]);
  }, []);

  const saveFabPosition = useCallback((x: number, y: number) => {
    const clamped = clampToViewport(x, y);
    setFabPosition(clamped);
    localStorage.setItem(FAB_KEY, JSON.stringify(clamped));
  }, []);

  return { wishlistedIds, toggleSong, removeSong, clearAll, fabPosition, saveFabPosition };
}
