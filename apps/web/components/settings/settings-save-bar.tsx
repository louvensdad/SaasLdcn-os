'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import { useUnsavedSettingsCount } from '@/stores/use-settings-draft-store';

interface SettingsSaveBarProps {
  readonly onDiscardAll: () => void;
  readonly onSaveAll: () => void;
}

/** Fixed bottom bar shown only while a draft-style preference field (see
 * useSettingsDraftField) is dirty. Deliberately does NOT cover the
 * already-working per-action mutations elsewhere on the page (AI key save,
 * Git connect, account delete) -- those keep their own immediate buttons. */
export function SettingsSaveBar({ onDiscardAll, onSaveAll }: SettingsSaveBarProps) {
  const { t } = useLocale();
  const count = useUnsavedSettingsCount();
  const [saving, setSaving] = useState(false);

  if (count === 0) return null;

  function handleSave() {
    setSaving(true);
    try {
      onSaveAll();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4" role="status">
      <div className="glass-panel-strong cinematic-surface flex w-full max-w-2xl flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--accent)_30%,var(--border))] p-4 shadow-[var(--shadow-cinematic)]">
        <p className="text-sm font-medium text-[color:var(--text)]">
          {t('settings.saveBar.unsavedChanges', { count })}
        </p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onDiscardAll} disabled={saving}>
            {t('settings.saveBar.discard')}
          </Button>
          <Button variant="primary" loading={saving} onClick={handleSave}>
            {t('settings.saveBar.save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
