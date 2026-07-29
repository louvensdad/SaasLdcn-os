'use client';

import { Canvas } from '@react-three/fiber';
import { Suspense, type ReactNode } from 'react';

export interface SceneCanvasInnerProps {
  readonly children: ReactNode;
  readonly dpr: number | [number, number];
  readonly frameloop: 'always' | 'demand' | 'never';
  readonly camera?: { position?: [number, number, number]; fov?: number };
}

/**
 * The actual WebGL Canvas. Loaded only on the client (via next/dynamic with
 * ssr:false from scene-canvas.tsx) because Three.js touches `window`/WebGL.
 */
export default function SceneCanvasInner({ children, dpr, frameloop, camera }: SceneCanvasInnerProps) {
  return (
    <Canvas
      dpr={dpr}
      frameloop={frameloop}
      camera={{ position: camera?.position ?? [0, 0, 5], fov: camera?.fov ?? 45 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      performance={{ min: 0.5 }}
    >
      <Suspense fallback={null}>{children}</Suspense>
    </Canvas>
  );
}
