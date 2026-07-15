'use client';

import type { LocaleCode } from '@contracts/locale.contract';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SettingsSection } from '@/components/settings/settings-section';
import { ThemeGallery } from '@/components/settings/theme-gallery';
import { useLocale } from '@/hooks/use-locale';
import { LOCALES } from '@/lib/i18n';
import { useLocaleStore } from '@/stores/use-locale-store';
import type { InterfaceDensity } from '@/stores/use-shell-store';
import { cn } from '@/lib/cn';

interface InterfaceTabProps {
  readonly density: InterfaceDensity;
  readonly onDensityChange: (density: InterfaceDensity) => void;
}

export function InterfaceTab({ density, onDensityChange }: InterfaceTabProps) {
  const { t } = useLocale();
  const preferences = useLocaleStore();
  const compact = density === 'compact';

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div>
          <h2 className="ds-section text-[color:var(--text)]">{t('settings.theme.title')}</h2>
          <p className="mt-2 ds-body ds-text-muted">{t('settings.theme.description')}</p>
        </div>
        <ThemeGallery />
      </section>

      <SettingsSection title={t('settings.personalization.title')} description={t('settings.personalization.description')}>
        <div className="flex flex-wrap gap-3">
          {(['comfortable', 'compact'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={density === option}
              onClick={() => onDensityChange(option)}
              className={cn(
                'focus-ring rounded-[var(--radius-md)] border px-4 py-2 text-sm font-medium transition-colors',
                density === option
                  ? 'border-[color-mix(in_srgb,var(--accent)_45%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-[color:var(--text)]'
                  : 'border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--text)]',
              )}
            >
              {t(`settings.personalization.density.${option}`)}
            </button>
          ))}
        </div>

        <div>
          <p className="ds-caption mb-3">{t('settings.personalization.previewLabel')}</p>
          <Card className={cn('flex flex-wrap items-center', compact ? 'gap-2 p-3' : 'gap-4 p-5')}>
            <Button variant="primary">{t('settings.personalization.previewButton')}</Button>
            <Badge tone="accent">{t('settings.personalization.previewBadge')}</Badge>
            <Input placeholder={t('settings.personalization.previewInput')} className={cn('max-w-[10rem]', compact && 'h-9')} readOnly />
          </Card>
        </div>
      </SettingsSection>

      <SettingsSection title={t('settings.localization.title')} description={t('settings.localization.description')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <LocaleField label={t('settings.generatedProjectLanguage')}><PreferenceSelect value={preferences.generatedProjectLocale} onChange={preferences.setGeneratedProjectLocale} /></LocaleField>
          <LocaleField label={t('settings.documentationLanguage')}><PreferenceSelect value={preferences.documentationLocale} onChange={preferences.setDocumentationLocale} /></LocaleField>
          <LocaleField label={t('settings.codeCommentsLanguage')}><PreferenceSelect value={preferences.codeCommentsLocale} onChange={preferences.setCodeCommentsLocale} /></LocaleField>
          <LocaleField label={t('settings.fallbackLanguage')}><PreferenceSelect value={preferences.fallbackLocale} onChange={preferences.setFallbackLocale} /></LocaleField>
        </div>
      </SettingsSection>
    </div>
  );
}

function LocaleField({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium text-[color:var(--text)]"><span>{label}</span>{children}</label>;
}

function PreferenceSelect({ value, onChange }: { readonly value: LocaleCode; readonly onChange: (locale: LocaleCode) => void }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value as LocaleCode)} className="w-full">
      {LOCALES.map((item) => <option key={item.code} value={item.code}>{item.nativeName}</option>)}
    </Select>
  );
}
