'use client';

import { PointMaterial, Points } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { Points as ThreePoints } from 'three';

import { useAccentColors } from './use-accent-colors';
import { useSceneMotion } from './use-scene-motion';

interface AmbientFieldProps {
  readonly count?: number;
  readonly radius?: number;
  readonly size?: number;
  readonly opacity?: number;
}

/**
 * The "quiet field" that surrounds the signature: a slow drift of accent-colored
 * particles in a sphere. Deliberately understated — depth, not spectacle. Freezes
 * under reduced motion.
 */
export function AmbientField({ count = 220, radius = 6, size = 0.035, opacity = 0.5 }: AmbientFieldProps) {
  const ref = useRef<ThreePoints>(null);
  const { accent } = useAccentColors();
  const { animate, lowPower } = useSceneMotion();
  const points = lowPower ? Math.round(count * 0.55) : count;

  const positions = useMemo(() => {
    // Seeded PRNG (mulberry32) keeps the render pure: the field looks random but
    // is identical on every re-render instead of reshuffling.
    let seed = 0x9e3779b9 ^ points;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const arr = new Float32Array(points * 3);
    for (let i = 0; i < points; i += 1) {
      const r = radius * Math.cbrt(rand());
      const theta = rand() * Math.PI * 2;
      const phi = Math.acos(2 * rand() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [points, radius]);

  useFrame((_, delta) => {
    if (!ref.current || !animate) return;
    ref.current.rotation.y += delta * 0.03;
    ref.current.rotation.x += delta * 0.012;
  });

  return (
    <Points ref={ref} positions={positions} stride={3} frustumCulled={false}>
      <PointMaterial
        transparent
        color={accent}
        size={size}
        sizeAttenuation
        depthWrite={false}
        opacity={opacity}
      />
    </Points>
  );
}
