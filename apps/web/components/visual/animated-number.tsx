'use client';

import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  readonly value: number;
  /** Animation duration in ms. */
  readonly durationMs?: number;
  /** Decimal places to render. */
  readonly decimals?: number;
  readonly suffix?: string;
  readonly prefix?: string;
  readonly className?: string;
}

/**
 * Count-up number. Animates from the previous value to the new one with an
 * ease-out curve, respecting `prefers-reduced-motion` (jumps straight to the
 * value). Purely presentational — the value itself is real backend data.
 */
export function AnimatedNumber({
  value,
  durationMs = 900,
  decimals = 0,
  suffix = '',
  prefix = '',
  className,
}: AnimatedNumberProps) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = fromRef.current;
    const to = value;
    if (reduce || from === to) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setDisplay(from + (to - from) * eased);
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      fromRef.current = to;
    };
  }, [value, durationMs]);

  const formatted = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return <span className={className}>{prefix}{formatted}{suffix}</span>;
}
