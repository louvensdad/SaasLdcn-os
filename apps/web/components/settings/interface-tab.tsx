'use client';

import { Check, Eye, LayoutDashboard, Monitor, Moon, Sparkles, Sun } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { SettingsToggleRow } from '@/components/settings/settings-toggle-row';
import { useLocale } from '@/hooks/use-locale';
import { useShellStore } from '@/stores/use-shell-store';
import type { InterfaceDensity } from '@/stores/use-shell-store';
import {
  ACCENTS, useInterfacePreferencesStore, type AccentId, type FontFamilyId, type FontSizeId,
} from '@/stores/use-interface-preferences-store';

interface InterfaceTabProps {
  readonly density: InterfaceDensity;
  readonly onDensityChange: (density: InterfaceDensity) => void;
}

const THEME_OPTIONS = [
  { id: 'light', Icon: Sun },
  { id: 'dark', Icon: Moon },
  { id: 'system', Icon: Monitor },
] as const;

export function InterfaceTab({ density, onDensityChange }: InterfaceTabProps) {
  const { t } = useLocale();
  const themeId = useShellStore((state) => state.themeId);
  const setThemeId = useShellStore((state) => state.setThemeId);
  const prefs = useInterfacePreferencesStore();

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      {/* ---- Aparência ---- */}
      <Card surface="secondary" className="rounded-[1.5rem] p-5">
        <SectionHeading icon={<Sparkles className="h-4 w-4" />} title={t('settings.interface.appearanceTitle')} description={t('settings.interface.appearanceDescription')} />

        <div className="mt-4 grid grid-cols-3 gap-3">
          {THEME_OPTIONS.map(({ id, Icon }) => {
            const selected = id === 'system' ? false : themeId === id;
            return (
              <button
                key={id}
                type="button"
                aria-label={id === 'light' ? 'Light' : id === 'dark' ? 'Dark' : 'System'}
                aria-pressed={selected}
                onClick={() => { if (id !== 'system') setThemeId(id); }}
                className="focus-ring rounded-[var(--radius-md)] border p-3 text-center transition-colors"
                style={selected ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' } : { borderColor: 'var(--border)' }}
              >
                <span className="mx-auto grid h-9 w-9 place-items-center rounded-[var(--radius-sm)] border border-[color:var(--border)]">
                  <Icon className="h-4 w-4 text-[color:var(--text)]" aria-hidden />
                </span>
                <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{t(`settings.interface.theme.${id}`)}</p>
                <p className="ds-caption">{t(`settings.interface.themeHint.${id}`)}</p>
              </button>
            );
          })}
        </div>

        <div className="mt-5">
          <p className="text-sm font-medium text-[color:var(--text)]">{t('settings.interface.accentTitle')}</p>
          <p className="ds-caption">{t('settings.interface.accentHint')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ACCENTS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-label={item.id}
                aria-pressed={prefs.accent === item.id}
                onClick={() => prefs.setAccent(item.id as AccentId)}
                className="focus-ring grid h-8 w-8 place-items-center rounded-full transition-transform hover:scale-110"
                style={{ background: item.accent, boxShadow: prefs.accent === item.id ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)' : undefined }}
              >
                {prefs.accent === item.id ? <Check className="h-4 w-4 text-white" /> : null}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <Field label={t('settings.interface.fontFamily')}>
            <Select value={prefs.fontFamily} onChange={(e) => prefs.setFontFamily(e.target.value as FontFamilyId)}>
              <option value="inter">{t('settings.interface.font.inter')}</option>
              <option value="system">{t('settings.interface.font.system')}</option>
              <option value="mono">{t('settings.interface.font.mono')}</option>
              <option value="serif">{t('settings.interface.font.serif')}</option>
            </Select>
          </Field>
          <Field label={t('settings.interface.fontSize')}>
            <Select value={prefs.fontSize} onChange={(e) => prefs.setFontSize(e.target.value as FontSizeId)}>
              <option value="small">{t('settings.interface.size.small')}</option>
              <option value="medium">{t('settings.interface.size.medium')}</option>
              <option value="large">{t('settings.interface.size.large')}</option>
            </Select>
          </Field>
          <Field label={t('settings.personalization.title')}>
            <div role="group" aria-label={t('settings.personalization.title')} className="grid grid-cols-2 gap-2">
              <button type="button" aria-label="Comfortable" aria-pressed={density === 'comfortable'} onClick={() => onDensityChange('comfortable')} className="focus-ring rounded-[var(--radius-md)] border px-3 py-2 text-sm" style={density === 'comfortable' ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' } : { borderColor: 'var(--border)' }}>{t('settings.personalization.density.comfortable')}</button>
              <button type="button" aria-label="Compact" aria-pressed={density === 'compact'} onClick={() => onDensityChange('compact')} className="focus-ring rounded-[var(--radius-md)] border px-3 py-2 text-sm" style={density === 'compact' ? { borderColor: 'var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' } : { borderColor: 'var(--border)' }}>{t('settings.personalization.density.compact')}</button>
            </div>
          </Field>
          <div>
            <span className="flex items-center justify-between text-sm font-medium text-[color:var(--text)]">
              {t('settings.interface.radius')}
              <span className="t-mono text-xs text-[color:var(--muted)]">{t('settings.interface.radiusValue', { px: String(prefs.radius) })}</span>
            </span>
            <input
              type="range" min={4} max={20} step={2} value={prefs.radius}
              onChange={(e) => prefs.setRadius(Number(e.target.value))}
              className="mt-2.5 w-full accent-[var(--accent)]"
            />
          </div>
        </div>

        <div className="mt-5 space-y-3 border-t border-[color:var(--border)] pt-4">
          <SettingsToggleRow label={t('settings.interface.animations')} description={t('settings.interface.animationsHint')} checked={prefs.animations} onChange={prefs.setAnimations} />
          <SettingsToggleRow label={t('settings.interface.reduceMotion')} description={t('settings.interface.reduceMotionHint')} checked={prefs.reduceMotion} onChange={prefs.setReduceMotion} />
        </div>
      </Card>

      {/* ---- Prévia + Configurações adicionais ---- */}
      <div className="space-y-4">
        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<Eye className="h-4 w-4" />} title={t('settings.interface.previewTitle')} description={t('settings.interface.previewDescription')} />
          <InterfacePreview />
        </Card>

        <Card surface="secondary" className="rounded-[1.5rem] p-5">
          <SectionHeading icon={<LayoutDashboard className="h-4 w-4" />} title={t('settings.interface.additionalTitle')} description={t('settings.interface.additionalDescription')} />
          <div className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2">
            <SettingsToggleRow label={t('settings.interface.breadcrumbs')} description={t('settings.interface.breadcrumbsHint')} checked={prefs.showBreadcrumbs} onChange={prefs.setShowBreadcrumbs} />
            <SettingsToggleRow label={t('settings.interface.helpTips')} description={t('settings.interface.helpTipsHint')} checked={prefs.showHelpTips} onChange={prefs.setShowHelpTips} />
            <SettingsToggleRow label={t('settings.interface.sidebarCollapsed')} description={t('settings.interface.sidebarCollapsedHint')} checked={prefs.sidebarCollapsedDefault} onChange={prefs.setSidebarCollapsedDefault} />
            <SettingsToggleRow label={t('settings.interface.focusMode')} description={t('settings.interface.focusModeHint')} checked={prefs.focusMode} onChange={prefs.setFocusMode} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function SectionHeading({ icon, title, description }: { readonly icon: React.ReactNode; readonly title: string; readonly description: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-[var(--radius-sm)]" style={{ background: 'color-mix(in srgb, var(--accent) 12%, transparent)', color: 'var(--accent)' }}>{icon}</span>
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-[color:var(--text)]">{title}</h3>
        <p className="ds-caption mt-0.5">{description}</p>
      </div>
    </div>
  );
}

function Field({ label, children }: { readonly label: string; readonly children: React.ReactNode }) {
  return <label className="grid gap-2 text-sm font-medium text-[color:var(--text)]"><span>{label}</span>{children}</label>;
}

/** Live-ish preview: a miniature dashboard whose surfaces use the real CSS
 * variables, so accent/radius/theme changes reflect here immediately. */
function InterfacePreview() {
  const { t } = useLocale();
  const metrics = [
    { label: t('settings.interface.previewProjects'), value: '24' },
    { label: t('settings.interface.previewGenerations'), value: '1.248' },
    { label: t('settings.interface.previewSuccess'), value: '98.6%' },
    { label: t('settings.interface.previewBuilds'), value: '342' },
  ];
  return (
    <div className="mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)]" style={{ background: 'var(--bg)' }}>
      <div className="flex">
        <div className="hidden w-28 shrink-0 flex-col gap-1.5 border-r border-[color:var(--border)] p-3 sm:flex" style={{ background: 'var(--surface-2)' }}>
          <div className="flex items-center gap-1.5">
            <span className="grid h-5 w-5 place-items-center rounded" style={{ background: 'var(--accent-gradient)' }}><Sparkles className="h-3 w-3 text-white" /></span>
            <span className="text-[10px] font-bold text-[color:var(--text)]">LDCN OS</span>
          </div>
          {['Dashboard', 'Gerações', 'Laboratory', 'Status'].map((item, index) => (
            <div key={item} className="flex items-center gap-1.5 rounded px-1.5 py-1 text-[9px]" style={index === 0 ? { background: 'color-mix(in srgb, var(--accent) 16%, transparent)', color: 'var(--text)' } : { color: 'var(--muted)' }}>
              <span className="h-2 w-2 rounded-sm" style={{ background: index === 0 ? 'var(--accent)' : 'var(--muted-2)' }} />
              {item}
            </div>
          ))}
        </div>
        <div className="min-w-0 flex-1 p-3">
          <p className="text-xs font-bold text-[color:var(--text)]">{t('settings.interface.previewHeading')}</p>
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-[var(--radius-sm)] border border-[color:var(--border)] p-2" style={{ background: 'var(--surface)' }}>
                <p className="truncate text-[8px] text-[color:var(--muted)]">{metric.label}</p>
                <p className="text-sm font-bold text-[color:var(--text)]">{metric.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 h-16 rounded-[var(--radius-sm)] border border-[color:var(--border)] p-2" style={{ background: 'var(--surface)' }}>
            <svg viewBox="0 0 200 44" className="h-full w-full" preserveAspectRatio="none" aria-hidden>
              <defs>
                <linearGradient id="preview-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polyline points="0,34 25,28 50,30 75,18 100,22 125,12 150,16 175,6 200,10" fill="none" stroke="var(--accent)" strokeWidth="2" />
              <polygon points="0,34 25,28 50,30 75,18 100,22 125,12 150,16 175,6 200,10 200,44 0,44" fill="url(#preview-area)" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}
