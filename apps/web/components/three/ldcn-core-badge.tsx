'use client';

import dynamic from 'next/dynamic';
import type { LdcnPresenceState } from '@contracts/ldcn.contract';

import { cn } from '@/lib/cn';

import { useSceneMotion } from './use-scene-motion';
import { useWebglSupported } from './use-webgl-supported';

// Whole Three.js scene behind the dynamic boundary → never in first-load JS.
const CoreScene = dynamic(() => import('./scenes/core-scene'), {
  ssr: false,
  loading: () => null,
});

interface LDCNCoreBadgeProps {
  readonly state?: LdcnPresenceState;
  readonly className?: string;
}

/**
 * Drop-in 3D replacement for the 2D `LDCNOrb` in prominent spots. Sizes from the
 * parent (pass width/height via className); the WebGL Core fills it, with a soft
 * CSS halo behind so it reads well before — and instead of — the scene.
 */
export function LDCNCoreBadge({ state, className }: LDCNCoreBadgeProps) {
  const { dpr } = useSceneMotion();
  const supported = useWebglSupported();

  return (
    <div className={cn('relative aspect-square overflow-hidden rounded-full', className)}>
      <span className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle,color-mix(in_srgb,var(--accent)_24%,transparent),transparent_70%)]" />
      {supported ? <CoreScene dpr={dpr} state={state} /> : null}
    </div>
  );
}
