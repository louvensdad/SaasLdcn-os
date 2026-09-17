'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

import { LOCALE_COOKIE, type Locale } from './locales';
import type { MessageKey, Messages } from './messages';
import { LOADERS } from './messages/load';

export type Vars = Readonly<Record<string, string | number>>;

/** Replaces {name} placeholders; unknown placeholders stay visible instead of disappearing. */
export function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

interface I18nApi {
  readonly locale: Locale;
  readonly t: (key: MessageKey, vars?: Vars) => string;
  /** For keys that come from the backend (briefing keys): falls back to the raw key so nothing is invented. */
  readonly tDynamic: (key: string, vars?: Vars) => string;
  /** Loads that locale's table before switching, so the page never flashes another language. */
  readonly setLocale: (next: Locale) => void;
}

const I18nContext = createContext<I18nApi | null>(null);

/**
 * The server picks the locale and hands over that locale's table; the other three stay in their own
 * chunks until someone asks for them. There is no en-US fallback here on purpose: every locale is
 * typed `Record<MessageKey, string>`, so a key present in one is present in all, and a key that is in
 * none came from the backend and must show as itself rather than silently reading in another language.
 */
export function I18nProvider({ initialLocale, initialMessages, children }: {
  readonly initialLocale: Locale;
  readonly initialMessages: Messages;
  readonly children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [messages, setMessages] = useState<Messages>(initialMessages);

  const t = useCallback((key: MessageKey, vars?: Vars) => format(messages[key] ?? key, vars), [messages]);

  const tDynamic = useCallback(
    (key: string, vars?: Vars) => format((messages as Readonly<Record<string, string>>)[key] ?? key, vars),
    [messages],
  );

  const setLocale = useCallback((next: Locale) => {
    void LOADERS[next]().then((table) => {
      document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
      document.documentElement.lang = next;
      setMessages(table);
      setLocaleState(next);
    });
  }, []);

  const value = useMemo(() => ({ locale, t, tDynamic, setLocale }), [locale, t, tDynamic, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nApi {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}
