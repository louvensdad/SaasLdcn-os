'use client';

import { useEffect } from 'react';

import {
  ACCENTS, FONT_SCALES, FONT_STACKS, useInterfacePreferencesStore,
} from '@/stores/use-interface-preferences-store';

/** Applies the user's Interface-tab appearance preferences to the document root
 * as live CSS variables / attributes, so accent colour, font, font size, corner
 * radius and motion actually change the whole product -- not just persist. */
export function useApplyInterfacePreferences() {
  const accent = useInterfacePreferencesStore((s) => s.accent);
  const fontFamily = useInterfacePreferencesStore((s) => s.fontFamily);
  const fontSize = useInterfacePreferencesStore((s) => s.fontSize);
  const radius = useInterfacePreferencesStore((s) => s.radius);
  const animations = useInterfacePreferencesStore((s) => s.animations);
  const reduceMotion = useInterfacePreferencesStore((s) => s.reduceMotion);
  const focusMode = useInterfacePreferencesStore((s) => s.focusMode);

  useEffect(() => {
    const root = document.documentElement;
    const def = ACCENTS.find((item) => item.id === accent) ?? ACCENTS[0];
    root.style.setProperty('--accent', def.accent);
    root.style.setProperty('--accent-2', def.accent2);
    root.style.setProperty('--accent-gradient', `linear-gradient(135deg, ${def.accent}, ${def.accent2})`);
  }, [accent]);

  useEffect(() => {
    document.documentElement.style.setProperty('--font-sans', FONT_STACKS[fontFamily]);
  }, [fontFamily]);

  useEffect(() => {
    // Scale the root font size; every rem-based token follows.
    document.documentElement.style.fontSize = `${FONT_SCALES[fontSize] * 100}%`;
  }, [fontSize]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty('--radius-md', `${radius / 16}rem`);
    root.style.setProperty('--radius-lg', `${(radius + 4) / 16}rem`);
    root.style.setProperty('--radius-sm', `${Math.max(radius - 4, 2) / 16}rem`);
  }, [radius]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.motion = animations && !reduceMotion ? 'on' : 'off';
    root.dataset.focusMode = focusMode ? 'on' : 'off';
  }, [animations, reduceMotion, focusMode]);
}
