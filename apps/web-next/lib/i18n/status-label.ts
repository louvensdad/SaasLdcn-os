'use client';

import { useCallback } from 'react';

import { statusLabel } from '../status';

import { useI18n } from './i18n';

/**
 * The phrase for a backend state, in the page's language. Use it everywhere a state reaches a person:
 * a badge, a sentence, an aria-label, a tooltip. The raw value stays available next to it as a
 * technical detail — REDESIGN.md §3.1 asks for the presentation to be translated, not for the state
 * to be replaced.
 */
export function useStatusLabel() {
  const { tDynamic } = useI18n();
  return useCallback((value: string | null | undefined) => statusLabel(value, tDynamic), [tDynamic]);
}
