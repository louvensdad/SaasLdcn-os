'use client';

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

interface DonutChartProps {
  /** 0..100 */
  readonly value: number;
  readonly size?: number;
  readonly stroke?: number;
  readonly color?: string;
  readonly track?: string;
  readonly children?: ReactNode;
  readonly className?: string;
}

/**
 * Animated SVG donut. The arc draws from 0 to `value` (stroke-dashoffset) the
 * first time it scrolls into view; static when reduced motion is preferred.
 */
export function DonutChart({
  value,
  size = 144,
  stroke = 12,
  color = 'var(--accent)',
  track = 'rgba(255,255,255,0.08)',
  children,
  className,
}: DonutChartProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const targetOffset = circumference - (clamped / 100) * circumference;
  const reduceMotion = useReducedMotion();

  return (
    <div className={className} style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={stroke} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: reduceMotion ? targetOffset : circumference }}
          whileInView={{ strokeDashoffset: targetOffset }}
          viewport={{ once: true, margin: '0px 0px -10% 0px' }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: 'drop-shadow(0 0 6px var(--glow))' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{children}</div>
    </div>
  );
}
