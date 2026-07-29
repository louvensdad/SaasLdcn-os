'use client';

import dynamic from 'next/dynamic';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

import type { TopoEdge, TopoNode } from './scenes/topology-scene';
import { useSceneMotion } from './use-scene-motion';
import { useWebglSupported } from './use-webgl-supported';

// Whole Three.js scene behind the dynamic boundary → never in first-load JS.
const TopologyScene = dynamic(() => import('./scenes/topology-scene'), {
  ssr: false,
  loading: () => null,
});

interface TopologyGraphProps {
  readonly nodes: readonly TopoNode[];
  readonly edges: readonly TopoEdge[];
  readonly className?: string;
  /** Shown when WebGL is unavailable (e.g. the existing 2D node grid). */
  readonly fallback?: ReactNode;
}

/**
 * Navigable 3D node graph. Interactive (orbit, no zoom — so it never hijacks page
 * scroll). Sizes from its parent; give the wrapper a height via className.
 */
export function TopologyGraph({ nodes, edges, className, fallback }: TopologyGraphProps) {
  const { animate, dpr } = useSceneMotion();
  const supported = useWebglSupported();

  if (supported === false) {
    return <>{fallback ?? null}</>;
  }

  return (
    <div className={cn('relative w-full touch-none', className)}>
      {supported === null ? (
        fallback ?? null
      ) : (
        <TopologyScene nodes={nodes} edges={edges} animate={animate} dpr={dpr} />
      )}
    </div>
  );
}
