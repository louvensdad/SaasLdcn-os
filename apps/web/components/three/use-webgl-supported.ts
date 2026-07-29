'use client';

import { useEffect, useState } from 'react';

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')),
    );
  } catch {
    return false;
  }
}

/**
 * Returns null until checked (client only), then true/false. Lets wrappers show
 * a fallback when WebGL is unavailable without pulling Three.js into the bundle.
 */
export function useWebglSupported(): boolean | null {
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    setSupported(detectWebGL());
  }, []);

  return supported;
}
