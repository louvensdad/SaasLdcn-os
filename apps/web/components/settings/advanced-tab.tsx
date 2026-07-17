'use client';

import type { ReactNode } from 'react';
import { Box, ChevronDown, Code2, Globe2, Layers, Triangle, Wifi } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { ActionLink } from '@/components/ui/action-link';
import { Select } from '@/components/ui/select';
import { SettingsToggleRow } from '@/components/settings/settings-toggle-row';
import { ArchitectureConstellation, CubeCluster, DottedWorldMap } from '@/components/settings/advanced-decorations';
import { useArchetypes } from '@/hooks/use-archetypes';
import { useArchitectures } from '@/hooks/use-architectures';
import { useFrameworks } from '@/hooks/use-frameworks';
import { useLanguages } from '@/hooks/use-languages';
import { useLocale } from '@/hooks/use-locale';
import { useAdvancedSettingsStore } from '@/stores/use-advanced-settings-store';
import { useLocaleStore } from '@/stores/use-locale-store';
import { TIMEZONE_OPTIONS, usePersonalPreferencesStore } from '@/stores/use-personal-preferences-store';
import type { LocaleCode } from '@contracts/locale.contract';
import { LOCALES } from '@/lib/i18n';

export function AdvancedTab() {
  const { t } = useLocale();
  const devMode = useAdvancedSettingsStore((state) => state.devMode);
  const setDevMode = useAdvancedSettingsStore((state) => state.setDevMode);
  const localePrefs = useLocaleStore();
  const personalPrefs = usePersonalPreferencesStore();
  const languagesQuery = useLanguages();
  const frameworksQuery = useFrameworks();
  const architecturesQuery = useArchitectures();
  const archetypesQuery = useArchetypes();

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center justify-between gap-6 rounded-[1.5rem] p-6">
        <div className="flex items-start gap-4">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-md)]"
            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
          >
            <Code2 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="ds-section text-[color:var(--text)]">{t('settings.advanced.title')}</h2>
            <p className="mt-2 max-w-xl ds-body ds-text-muted">{t('settings.advanced.description')}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <SettingsToggleRow label={t('settings.advanced.devMode')} description={t('settings.advanced.devModeHint')} checked={devMode} onChange={setDevMode} />
          <CubeCluster />
        </div>
      </Card>

      <Card className="cinematic-surface relative overflow-hidden rounded-[1.5rem] p-0" style={{ background: 'linear-gradient(160deg, #0d0a1f 0%, #171233 100%)' }}>
        <div className="ambient-grid pointer-events-none absolute inset-0 opacity-25" />
        <ActionLink
          href="/architecture"
          className="absolute right-5 top-5 z-10 shrink-0 border shadow-none"
          style={{ background: 'rgba(124,58,237,0.18)', borderColor: 'rgba(124,58,237,0.35)', color: '#e4d9ff' }}
        >
          <Wifi className="h-4 w-4" />
          {t('settings.contracts.liveTopology')}
          <ChevronDown className="h-4 w-4 opacity-70" />
        </ActionLink>

        <div className="relative grid gap-6 p-5 md:p-6">
          <div className="grid items-center gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="min-w-0 pr-24 lg:pr-0">
              <p className="ds-caption" style={{ color: 'rgba(255,255,255,0.55)' }}>{t('settings.contracts.eyebrow')}</p>
              <h2 className="mt-1 text-xl font-semibold text-white">{t('settings.contracts.title')}</h2>
              <p className="mt-2 max-w-md text-sm leading-6" style={{ color: 'rgba(255,255,255,0.65)' }}>{t('settings.contracts.description')}</p>
            </div>
            <ArchitectureConstellation className="h-[clamp(18rem,34vh,26rem)] w-full" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <DarkMetricCard icon={<Code2 className="h-4 w-4" />} label={t('settings.contracts.languages')} value={languagesQuery.data?.length} detail={t('settings.contracts.languagesDetail')} />
            <DarkMetricCard icon={<Layers className="h-4 w-4" />} label={t('settings.contracts.frameworks')} value={frameworksQuery.data?.length} detail={t('settings.contracts.frameworksDetail')} />
            <DarkMetricCard icon={<Box className="h-4 w-4" />} label={t('settings.contracts.architectures')} value={architecturesQuery.data?.length} detail={t('settings.contracts.architecturesDetail')} />
            <DarkMetricCard icon={<Triangle className="h-4 w-4" />} label={t('settings.contracts.archetypes')} value={archetypesQuery.data?.length} detail={t('settings.contracts.archetypesDetail')} />
          </div>
        </div>
      </Card>

      <Card surface="primary" className="relative overflow-hidden rounded-[1.5rem] p-6">
        <div className="flex items-start gap-4">
          <span
            className="grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-md)]"
            style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}
          >
            <Globe2 className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 className="ds-section text-[color:var(--text)]">{t('settings.localization.title')}</h2>
            <p className="mt-2 max-w-xl ds-body ds-text-muted">{t('settings.localization.description')}</p>
          </div>
        </div>

        <div className="mt-6 grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
          <div className="grid gap-x-4 gap-y-5 sm:grid-cols-3">
            <LocaleField label={t('settings.interfaceLanguage')} hint={t('settings.localization.interfaceHint')}>
              <LocalePreferenceSelect value={localePrefs.interfaceLocale} onChange={localePrefs.setInterfaceLocale} />
            </LocaleField>
            <LocaleField label={t('settings.generatedProjectLanguage')} hint={t('settings.localization.generatedHint')}>
              <LocalePreferenceSelect value={localePrefs.generatedProjectLocale} onChange={localePrefs.setGeneratedProjectLocale} />
            </LocaleField>
            <LocaleField label={t('settings.documentationLanguage')} hint={t('settings.localization.documentationHint')}>
              <LocalePreferenceSelect value={localePrefs.documentationLocale} onChange={localePrefs.setDocumentationLocale} />
            </LocaleField>
            <div className="hidden sm:block" aria-hidden />
            <div className="hidden sm:block" aria-hidden />
            <LocaleField label={t('settings.account.timezone')} hint={t('settings.localization.timezoneHint')}>
              <Select value={personalPrefs.timezone} onChange={(event) => personalPrefs.setTimezone(event.target.value)}>
                {TIMEZONE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </Select>
            </LocaleField>
          </div>
          <DottedWorldMap className="hidden h-auto w-full opacity-90 lg:block" />
        </div>
      </Card>
    </div>
  );
}

function LocaleField({ label, hint, children }: { readonly label: string; readonly hint: string; readonly children: ReactNode }) {
  return (
    <label className="grid content-start gap-2 text-sm font-medium text-[color:var(--text)]">
      <span>{label}</span>
      {children}
      <span className="ds-caption font-normal">{hint}</span>
    </label>
  );
}

function LocalePreferenceSelect({ value, onChange }: { readonly value: LocaleCode; readonly onChange: (locale: LocaleCode) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value as LocaleCode)} className="w-full">
      {LOCALES.map((item) => <option key={item.code} value={item.code}>{item.nativeName}</option>)}
    </Select>
  );
}

function DarkMetricCard({ icon, label, value, detail }: { readonly icon: ReactNode; readonly label: string; readonly value: number | undefined; readonly detail: string }) {
  const { t } = useLocale();
  return (
    <div className="rounded-[var(--radius-lg)] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)' }}>{label}</p>
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)]"
          style={{ background: 'rgba(124,58,237,0.18)', color: '#c9b8ff' }}
          aria-hidden
        >
          {icon}
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold text-white">{value ?? t('common.unavailable')}</p>
      <p className="mt-1 text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{detail}</p>
    </div>
  );
}
