'use client';

import type { LocaleCode } from '@contracts/locale.contract';

import { Select } from '@/components/ui/select';
import { LOCALES } from '@/lib/i18n';
import { useLocale } from '@/hooks/use-locale';
import { useLocaleStore } from '@/stores/use-locale-store';

export function LocaleSelector({ compact = false }: { readonly compact?: boolean }) {
  const { t } = useLocale();
  const locale = useLocaleStore((state) => state.interfaceLocale);
  const hasHydrated = useLocaleStore((state) => state.hasHydrated);
  const setLocale = useLocaleStore((state) => state.setInterfaceLocale);
  return (
    <Select
      aria-label={t('settings.interfaceLanguage')}
      className={compact ? 'h-10 max-w-36 rounded-full px-3' : 'w-full'}
      value={locale}
      disabled={!hasHydrated}
      onChange={(event) => setLocale(event.target.value as LocaleCode)}
    >
      {LOCALES.map((item) => <option key={item.code} value={item.code}>{item.nativeName}</option>)}
    </Select>
  );
}
