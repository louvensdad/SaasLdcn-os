'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { Badge, Kv, Notice, Skeleton, Source } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { isLocale, LOCALE_LABEL, LOCALES } from '@/lib/i18n/locales';
import { applyDensity, applyTheme, readDensity, readTheme, type Density, type ThemeMode } from '@/lib/preferences';

const THEMES: readonly ThemeMode[] = ['system', 'dark', 'light'];
const DENSITIES: readonly Density[] = ['comfortable', 'compact'];

export function PreferencesScreen() {
  const { t, locale, setLocale } = useI18n();
  const queryClient = useQueryClient();
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [density, setDensity] = useState<Density>('comfortable');

  useEffect(() => {
    setTheme(readTheme());
    setDensity(readDensity());
  }, []);

  const iface = useQuery({ queryKey: ['interface-preferences'], queryFn: api.interfacePreferences, retry: false });
  const ai = useQuery({ queryKey: ['ai-preferences'], queryFn: api.aiPreferences, retry: false });
  const save = useMutation({
    mutationFn: () => api.saveInterfacePreferences({ ...(iface.data?.data ?? {}), theme, density, locale }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interface-preferences'] }),
  });

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow"><span className="label">{t('nav.settings')}</span></div>
          <h1 className="title">{t('settings.preferences.title')}</h1>
          <p className="lede">{t('settings.preferences.lede')}</p>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head"><h2 className="h-sec">{t('settings.preferences.interface.title')}</h2></div>
        <div className="form-grid">
          <label className="field">
            <span className="field-label">{t('settings.preferences.theme')}</span>
            <select value={theme} onChange={(event) => { const next = event.target.value as ThemeMode; applyTheme(next); setTheme(next); }}>
              {THEMES.map((value) => <option key={value} value={value}>{t(`theme.${value}`)}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t('settings.preferences.density')}</span>
            <select value={density} onChange={(event) => { const next = event.target.value as Density; applyDensity(next); setDensity(next); }}>
              {DENSITIES.map((value) => <option key={value} value={value}>{t(`density.${value}`)}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">{t('shell.language')}</span>
            <select value={locale} onChange={(event) => { if (isLocale(event.target.value)) setLocale(event.target.value); }}>
              {LOCALES.map((code) => <option key={code} value={code}>{LOCALE_LABEL[code]}</option>)}
            </select>
          </label>
        </div>
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary" type="button" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? t('settings.preferences.saving') : t('settings.preferences.save')}
          </button>
        </div>
        {save.isSuccess ? <Notice family="proof" title={t('settings.preferences.saved')} /> : null}
        <p className="meta" style={{ marginTop: 10 }}>{t('settings.preferences.note')}</p>
        <Source>GET · PUT /api/users/me/preferences/interface</Source>
      </section>

      <div className="grid g-2">
        <section className="sec">
          <div className="sec-head"><h2 className="h-sec">{t('settings.preferences.stored.title')}</h2></div>
          {iface.isPending ? <Skeleton lines={3} /> : null}
          {iface.data ? (
            <pre className="json">{JSON.stringify(iface.data.data ?? {}, null, 2)}</pre>
          ) : null}
          <p className="meta" style={{ marginTop: 8 }}>{t('settings.preferences.stored.note')}</p>
        </section>

        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('settings.preferences.ai.title')}</h2>
            {ai.data ? <Badge value="ai" family="idle" /> : null}
          </div>
          {ai.isPending ? <Skeleton lines={3} /> : null}
          {ai.data ? <pre className="json">{JSON.stringify(ai.data.data ?? {}, null, 2)}</pre> : null}
          <Kv pairs={[[t('settings.preferences.ai.where'), <span key="w" className="mono">/api/users/me/preferences/ai</span>]]} />
          <p className="meta" style={{ marginTop: 8 }}>{t('settings.preferences.ai.note')}</p>
        </section>
      </div>
    </>
  );
}
