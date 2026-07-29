'use client';

import dynamic from 'next/dynamic';

import { cn } from '@/lib/cn';

import { SceneFallback } from './scene-fallback';
import { useSceneMotion } from './use-scene-motion';
import { useWebglSupported } from './use-webgl-supported';

// Whole Three.js scene behind the dynamic boundary → never in first-load JS.
const AmbientScene = dynamic(() => import('./scenes/ambient-scene'), {
  ssr: false,
  loading: () => null,
});

interface AmbientBackdropProps {
  readonly className?: string;
  readonly count?: number;
  readonly radius?: number;
  readonly opacity?: number;
  readonly size?: number;
}

/**
 * Reusable, non-interactive 3D backdrop: a slow accent-colored particle field
 * behind page content. Absolutely positioned to fill its relative parent. Falls
 * back to a calm CSS glow when WebGL is unavailable.
 */
export function AmbientBackdrop({
  className,
  count = 200,
  radius = 7,
  opacity = 0.42,
  size = 0.04,
}: AmbientBackdropProps) {
  const { dpr } = useSceneMotion();
  const supported = useWebglSupported();

  if (supported === false) {
    return <SceneFallback className={className} />;
  }

  return (
    <div aria-hidden className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}>
      {supported === null ? (
        <SceneFallback />
      ) : (
        <AmbientScene dpr={dpr} count={count} radius={radius} opacity={opacity} size={size} />
      )}
    </div>
  );
}
