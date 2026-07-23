import { useState, useCallback, useEffect, useRef } from 'react';

const WISHLIST_KEY = 'zyleta-wishlist';
const FAB_KEY = 'zyleta-wishlist-fab';

const LEGACY_MOBILE_FAB_SIZE = 56;
const FAB_WIDTH = 100;
const FAB_GAP = 16;
const DESKTOP_MIN_WIDTH = 900;
const TOOLBAR_X_RATIO = 0.75;
const TOOLBAR_Y_OFFSET = 10;

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
    x: Math.max(0, Math.min(x, window.innerWidth - LEGACY_MOBILE_FAB_SIZE)),
    y: Math.max(0, Math.min(y, window.innerHeight - LEGACY_MOBILE_FAB_SIZE)),
  };
}

function getDefaultFabPosition(): FabPosition {
  const fallback = {
    x: window.innerWidth - LEGACY_MOBILE_FAB_SIZE - FAB_GAP,
    y: window.innerHeight - LEGACY_MOBILE_FAB_SIZE - FAB_GAP,
  };

  if (window.innerWidth < DESKTOP_MIN_WIDTH) return fallback;

  const toolbar = document.querySelector<HTMLElement>('[role="toolbar"]');
  if (!toolbar) return fallback;

  const rect = toolbar.getBoundingClientRect();
  return clampToViewport(
    rect.left + rect.width * TOOLBAR_X_RATIO - FAB_WIDTH / 2,
    rect.top - TOOLBAR_Y_OFFSET,
  );
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
  const hasSavedFabPositionRef = useRef(localStorage.getItem(FAB_KEY) !== null);
  const [fabPosition, setFabPosition] = useState<FabPosition>(readFabPosition);

  useEffect(() => {
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(wishlistedIds));
  }, [wishlistedIds]);

  const toggleSong = useCallback((id: string) => {
    setWishlistedIds((prev) => {
      if (prev.includes(id)) return prev.filter((sid) => sid !== id);
      if (prev.length === 0 && !hasSavedFabPositionRef.current) {
        setFabPosition(getDefaultFabPosition());
      }
      return [...prev, id];
    });
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
    hasSavedFabPositionRef.current = true;
    localStorage.setItem(FAB_KEY, JSON.stringify(clamped));
  }, []);

  return { wishlistedIds, toggleSong, removeSong, clearAll, fabPosition, saveFabPosition };
}
