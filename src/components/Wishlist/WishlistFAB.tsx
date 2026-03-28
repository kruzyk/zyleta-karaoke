import { useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './WishlistFAB.module.css';

interface WishlistFABProps {
  count: number;
  position: { x: number; y: number };
  onOpen: () => void;
  onPositionChange: (x: number, y: number) => void;
}

const DRAG_THRESHOLD = 5;
const FAB_W = 100;
const FAB_H = 54;

export function WishlistFAB({ count, position, onOpen, onPositionChange }: WishlistFABProps) {
  const { t } = useTranslation();
  const isDraggingRef = useRef(false);
  const startPointerRef = useRef({ x: 0, y: 0 });
  const startPositionRef = useRef({ x: 0, y: 0 });
  const currentPositionRef = useRef({ x: position.x, y: position.y });

  const clamp = useCallback((x: number, y: number) => {
    const maxX = window.innerWidth - FAB_W;
    const maxY = window.innerHeight - FAB_H;
    return {
      x: Math.max(0, Math.min(x, maxX)),
      y: Math.max(0, Math.min(y, maxY)),
    };
  }, []);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    isDraggingRef.current = false;
    startPointerRef.current = { x: e.clientX, y: e.clientY };
    startPositionRef.current = {
      x: currentPositionRef.current.x,
      y: currentPositionRef.current.y,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (e.buttons === 0) return;
      const dx = e.clientX - startPointerRef.current.x;
      const dy = e.clientY - startPointerRef.current.y;
      if (!isDraggingRef.current && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        isDraggingRef.current = true;
      }
      if (isDraggingRef.current) {
        const clamped = clamp(startPositionRef.current.x + dx, startPositionRef.current.y + dy);
        currentPositionRef.current = clamped;
        const el = e.currentTarget;
        el.style.left = `${clamped.x}px`;
        el.style.top = `${clamped.y}px`;
      }
    },
    [clamp],
  );

  useEffect(() => {
    const handleResize = () => {
      const clamped = clamp(currentPositionRef.current.x, currentPositionRef.current.y);
      if (
        clamped.x !== currentPositionRef.current.x ||
        clamped.y !== currentPositionRef.current.y
      ) {
        currentPositionRef.current = clamped;
        onPositionChange(clamped.x, clamped.y);
      }
    };
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, [clamp, onPositionChange]);

  const handlePointerUp = useCallback(() => {
    if (isDraggingRef.current) {
      onPositionChange(currentPositionRef.current.x, currentPositionRef.current.y);
    } else {
      onOpen();
    }
    isDraggingRef.current = false;
  }, [onOpen, onPositionChange]);

  return (
    <button
      className={styles.fab}
      style={{ left: position.x, top: position.y }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      aria-label={t('wishlist.openList', { count })}
      type="button"
    >
      {/* Razor blade icon — original asset, neon-colored */}
      <svg
        className={styles.bladeSvg}
        viewBox="0 0 122.88 66.19"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          fill="var(--neon-primary)"
          d="M12.42,0H110.8c3.2,0,6.64,2.72,5.82,5.82-1.29,4.87-1.91,9,2.3,8.74a3.89,3.89,0,0,1,4,4v29.7a3.88,3.88,0,0,1-4,4c-4.2-.29-3.59,3.31-2.3,8.18.81,3.09-2.62,5.82-5.82,5.82H12.42A5.84,5.84,0,0,1,6.6,60.37c0-4.82,2.77-8.18-2.64-8.18a4,4,0,0,1-4-4V18.53a4,4,0,0,1,4-4c5.41,0,2.64-3.92,2.64-8.74A5.84,5.84,0,0,1,12.42,0Zm1.77,24.26h0a2.4,2.4,0,0,1,2.44,2.33v3.49a5.4,5.4,0,0,0,3.58,1.15,6,6,0,0,0,2.95-.7,6.91,6.91,0,0,1,6.32-4,7.07,7.07,0,0,1,4.36,1.49c.91.71,1.56,1.87,2.49,2.43a5.91,5.91,0,0,0,3,.74,5.3,5.3,0,0,0,3.8-1.35V26.59a2.39,2.39,0,0,1,2.44-2.33h0A2.4,2.4,0,0,1,48,26.59v3.49a5.38,5.38,0,0,0,3.58,1.15,6,6,0,0,0,3-.7,6.91,6.91,0,0,1,6.32-4,7,7,0,0,1,4.35,1.49c2.18,1.7,3.55,5,7.12,2.1V26.59a2.39,2.39,0,0,1,2.44-2.33h0a2.4,2.4,0,0,1,2.44,2.33v3.49a5.66,5.66,0,0,0,3.58,1.15c1.25,0,4.63-.23,5.46-.7a6.9,6.9,0,0,1,6.31-4,7,7,0,0,1,4.36,1.49c.91.71,1.56,1.87,2.5,2.43a5.87,5.87,0,0,0,3,.74,5.3,5.3,0,0,0,3.8-1.35V26.59a2.4,2.4,0,0,1,2.44-2.33h0a2.4,2.4,0,0,1,2.44,2.33V39.78a2.4,2.4,0,0,1-2.44,2.33h0a2.4,2.4,0,0,1-2.44-2.33V36.33a5.3,5.3,0,0,0-3.8-1.35,5.85,5.85,0,0,0-2.91.69c-1.13.63-1.45,1.61-2.47,2.44a7.13,7.13,0,0,1-4.49,1.61,7.22,7.22,0,0,1-6.35-4.06c-.83-.46-4.18-.68-5.42-.68a5.76,5.76,0,0,0-3.58,1.15v3.65a2.4,2.4,0,0,1-2.44,2.33h0a2.4,2.4,0,0,1-2.44-2.33V36.05c-3.55-2.83-4.9.35-7,2.06a7.15,7.15,0,0,1-4.49,1.61,7.24,7.24,0,0,1-6.36-4.06A6,6,0,0,0,51.61,35,5.46,5.46,0,0,0,48,36.13v3.65a2.4,2.4,0,0,1-2.44,2.33h0a2.39,2.39,0,0,1-2.44-2.33V36.33A5.3,5.3,0,0,0,39.35,35a5.89,5.89,0,0,0-2.92.69C35.31,36.3,35,37.28,34,38.11a7.15,7.15,0,0,1-4.49,1.61,7.25,7.25,0,0,1-6.36-4.06A6,6,0,0,0,20.21,35a5.46,5.46,0,0,0-3.58,1.15v3.65a2.4,2.4,0,0,1-2.44,2.33h0a2.4,2.4,0,0,1-2.44-2.33V26.59a2.4,2.4,0,0,1,2.44-2.33Z"
        />
      </svg>

      {/* Count centered over the blade */}
      <span className={styles.countLabel}>{count}</span>
    </button>
  );
}
