'use client';

import type { LdcnPresenceState } from '@contracts/ldcn.contract';

import { LDCNCore } from '../ldcn-core';
import SceneCanvasInner from '../scene-canvas-inner';
import { SceneEffects } from '../scene-effects';

interface CoreSceneProps {
  readonly dpr: number | [number, number];
  readonly state?: LdcnPresenceState;
  readonly scale?: number;
  readonly detail?: number;
}

/**
 * Self-contained LDCN Core scene. Dynamic-import boundary for the signature orb —
 * keeps Three.js/drei out of every page's first-load bundle.
 */
export default function CoreScene({ dpr, state, scale = 0.8, detail = 5 }: CoreSceneProps) {
  return (
    <SceneCanvasInner dpr={dpr} frameloop="always" camera={{ position: [0, 0, 4.8], fov: 42 }}>
      <LDCNCore state={state} scale={scale} detail={detail} />
      <SceneEffects intensity={0.6} />
    </SceneCanvasInner>
  );
}
