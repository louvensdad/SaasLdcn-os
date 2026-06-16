'use client';

import { useCallback, useEffect } from 'react';

import { translate } from '@/lib/i18n';
import { useLocaleStore } from '@/stores/use-locale-store';

export function useLocale() {
  const locale = useLocaleStore((state) => state.interfaceLocale);
  const fallbackLocale = useLocaleStore((state) => state.fallbackLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useCallback(
    (key: string, values?: Record<string, string | number>) =>
      translate(locale, key, values, fallbackLocale),
    [fallbackLocale, locale],
  );

  return {
    locale,
    fallbackLocale,
    t,
  };
}
