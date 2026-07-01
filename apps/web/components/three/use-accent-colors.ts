'use client';

import { useMemo } from 'react';
import { Color } from 'three';

import { DEFAULT_THEME_ID, THEMES } from '@/lib/themes';
import { useShellStore } from '@/stores/use-shell-store';

export interface AccentColors {
  readonly accent: Color;
  readonly accentSecondary: Color;
  readonly accentHex: string;
  readonly accentSecondaryHex: string;
}

/**
 * Derives Three.js colors from the active theme. Subscribes to `themeId` so the
 * 3D scenes recolor instantly when the user switches accent palettes, without
 * reading computed CSS variables off the DOM.
 */
export function useAccentColors(): AccentColors {
  const themeId = useShellStore((state) => state.themeId);

  return useMemo(() => {
    const theme =
      THEMES.find((item) => item.id === themeId) ??
      THEMES.find((item) => item.id === DEFAULT_THEME_ID) ??
      THEMES[0];

    return {
      accent: new Color(theme.accent),
      accentSecondary: new Color(theme.accentSecondary),
      accentHex: theme.accent,
      accentSecondaryHex: theme.accentSecondary,
    };
  }, [themeId]);
}
