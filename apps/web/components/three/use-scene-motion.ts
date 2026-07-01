'use client';

import { useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

export interface SceneMotion {
  /** False when the user prefers reduced motion — scenes should hold still. */
  readonly animate: boolean;
  /** Mobile or low-core device — render lighter. */
  readonly lowPower: boolean;
  /** Device pixel ratio bounds for the Canvas (capped on low-power devices). */
  readonly dpr: number | [number, number];
}

/**
 * Single source of truth for how heavy a 3D scene is allowed to be. Combines
 * `prefers-reduced-motion` with a cheap device heuristic so every scene respects
 * the same accessibility and performance budget.
 */
export function useSceneMotion(): SceneMotion {
  const reduceMotion = useReducedMotion();
  const [lowPower, setLowPower] = useState(false);

  useEffect(() => {
    const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 8;
    setLowPower(mobile || cores <= 4);
  }, []);

  return {
    animate: !reduceMotion,
    lowPower,
    dpr: lowPower ? 1 : [1, 2],
  };
}
