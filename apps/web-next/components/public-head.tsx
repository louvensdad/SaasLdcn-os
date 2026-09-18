'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Icon } from '@/components/signal';
import { useI18n } from '@/lib/i18n/i18n';
import { isLocale, LOCALE_LABEL, LOCALES } from '@/lib/i18n/locales';
import { applyTheme, readTheme, type ThemeMode } from '@/lib/preferences';

const ORDER: readonly ThemeMode[] = ['system', 'dark', 'light'];

/** Header of the screens outside the app shell (sign-in, provider return, workspace choice). */
export function PublicHead() {
  const { t, locale, setLocale } = useI18n();
  const [theme, setTheme] = useState<ThemeMode>('system');
  useEffect(() => setTheme(readTheme()), []);

  const cycle = () => {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    applyTheme(next);
    setTheme(next);
  };

  return (
    <header className="public-head">
      <Link className="public-brand" href="/">
        <svg aria-hidden="true"><use href="#i-mark" /></svg>
        <span>{t('app.name')}</span>
      </Link>
      <nav className="public-nav" aria-label={t('nav.global')}>
        <select className="locale-select" aria-label={t('shell.language')} value={locale} onChange={(event) => { if (isLocale(event.target.value)) setLocale(event.target.value); }}>
          {LOCALES.map((code) => <option key={code} value={code}>{LOCALE_LABEL[code]}</option>)}
        </select>
        <button className="iconbtn" type="button" onClick={cycle} aria-label={t('shell.theme', { mode: t(`theme.${theme}`) })} title={t('shell.theme', { mode: t(`theme.${theme}`) })}>
          <Icon name="theme" />
        </button>
      </nav>
    </header>
  );
}
