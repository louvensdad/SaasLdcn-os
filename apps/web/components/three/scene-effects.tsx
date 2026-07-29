'use client';

import { Bloom, EffectComposer } from '@react-three/postprocessing';

import { useSceneMotion } from './use-scene-motion';

interface SceneEffectsProps {
  readonly intensity?: number;
}

/**
 * Subtle cinematic bloom around emissive objects. Skipped entirely on low-power
 * devices — the materials already glow, so this is pure polish, not a dependency.
 * Must be rendered as a sibling of the scene meshes (a direct Canvas child).
 */
export function SceneEffects({ intensity = 0.7 }: SceneEffectsProps) {
  const { lowPower } = useSceneMotion();
  if (lowPower) return null;

  return (
    <EffectComposer>
      <Bloom
        intensity={intensity}
        luminanceThreshold={0.2}
        luminanceSmoothing={0.9}
        mipmapBlur
      />
    </EffectComposer>
  );
}
