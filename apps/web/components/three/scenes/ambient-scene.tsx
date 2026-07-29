'use client';

import { AmbientField } from '../ambient-field';
import SceneCanvasInner from '../scene-canvas-inner';

interface AmbientSceneProps {
  readonly dpr: number | [number, number];
  readonly count: number;
  readonly radius: number;
  readonly opacity: number;
  readonly size: number;
}

/**
 * Self-contained particle-field scene. This module is the dynamic-import boundary
 * for the ambient backdrop — everything Three.js-related lives at or below here,
 * so it never enters a page's first-load bundle.
 */
export default function AmbientScene({ dpr, count, radius, opacity, size }: AmbientSceneProps) {
  return (
    <SceneCanvasInner dpr={dpr} frameloop="always" camera={{ position: [0, 0, 9], fov: 52 }}>
      <AmbientField count={count} radius={radius} opacity={opacity} size={size} />
    </SceneCanvasInner>
  );
}
