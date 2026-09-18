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
 * chunks until someone asks for them. A key that is in no table at all came from the backend and still
 * shows as itself rather than silently reading in another language -- that is what tDynamic is for.
 *
 * `t` has one fallback, and it exists for a failure seen twice on a running dev server: the table a
 * locale switch lazily loads can be a cached chunk older than the source, and every key added since is
 * then missing from it, so screens printed `architecture.drawing.title` at people. The compiler
 * guarantees the four locales carry the same keys, so a key missing from the lazily loaded table is
 * never a translation gap -- it is a stale chunk. Falling back to the table the server rendered this
 * page with degrades that to a sentence in the other language instead of to a key.
 */
export function I18nProvider({ initialLocale, initialMessages, children }: {
  readonly initialLocale: Locale;
  readonly initialMessages: Messages;
  readonly children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);
  const [messages, setMessages] = useState<Messages>(initialMessages);

  const t = useCallback((key: MessageKey, vars?: Vars) => format(messages[key] ?? initialMessages[key] ?? key, vars), [messages, initialMessages]);

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
