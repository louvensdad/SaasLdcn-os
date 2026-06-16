'use client';

import { animate, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

import { EASE_OUT } from '@/lib/motion';

interface AnimatedCounterProps {
  readonly value: number;
  readonly durationMs?: number;
  readonly className?: string;
  /** Format the displayed integer (e.g. add a suffix or percent sign). */
  readonly format?: (value: number) => string;
}

/**
 * Counts up from 0 to `value` the first time it enters the viewport.
 * Renders the final value immediately when reduced motion is preferred.
 */
export function AnimatedCounter({ value, durationMs = 900, className, format }: AnimatedCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(reduceMotion ? value : 0);

  useEffect(() => {
    if (reduceMotion) {
      setDisplay(value);
      return;
    }
    if (!inView) return;
    const controls = animate(0, value, {
      duration: durationMs / 1000,
      ease: EASE_OUT,
      onUpdate: (latest) => setDisplay(latest),
    });
    return () => controls.stop();
  }, [inView, value, durationMs, reduceMotion]);

  const rounded = Math.round(display);
  return (
    <span ref={ref} className={className}>
      {format ? format(rounded) : rounded}
    </span>
  );
}
