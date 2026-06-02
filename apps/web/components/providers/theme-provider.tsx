'use client';

import { useEffect } from 'react';

import { THEMES } from '@/lib/themes';
import { useShellStore } from '@/stores/use-shell-store';

export function ThemeProvider() {
  const themeId = useShellStore((state) => state.themeId);
  const setHydrated = useShellStore((state) => state.setHydrated);

  useEffect(() => {
    const root = document.documentElement;
    const theme = THEMES.find((item) => item.id === themeId) ?? THEMES[0];

    root.dataset.theme = theme.id;
    root.style.setProperty('--theme-accent', theme.accent);
    root.style.setProperty('--theme-accent-secondary', theme.accentSecondary);
    setHydrated(true);
  }, [setHydrated, themeId]);

  return null;
}
