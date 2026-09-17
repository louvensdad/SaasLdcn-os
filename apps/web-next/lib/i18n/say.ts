'use client';

import { useCallback } from 'react';

import { useI18n, type Vars } from './i18n';

/**
 * The backend sends a translation key alongside a sentence it wrote itself (often Portuguese, kept for
 * compatibility with rows written before the keys existed). Read the key when this interface carries that
 * message, and otherwise show the backend's own sentence -- never a raw key.
 */
export function useSay() {
  const { tDynamic } = useI18n();
  return useCallback(
    (key: string | undefined, fallback: string, vars?: Vars) => {
      if (!key) return fallback;
      const translated = tDynamic(key, vars);
      return translated === key ? fallback : translated;
    },
    [tDynamic],
  );
}
