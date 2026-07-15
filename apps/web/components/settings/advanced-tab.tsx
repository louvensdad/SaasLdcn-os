'use client';

import { Card } from '@/components/ui/card';
import { SettingsSection } from '@/components/settings/settings-section';
import { SettingsToggleRow } from '@/components/settings/settings-toggle-row';
import { ArchitectureGraphSurface } from '@/components/visual/engineering-surface';
import { useArchetypes } from '@/hooks/use-archetypes';
import { useArchitectures } from '@/hooks/use-architectures';
import { useFrameworks } from '@/hooks/use-frameworks';
import { useLanguages } from '@/hooks/use-languages';
import { useLocale } from '@/hooks/use-locale';
import { useAdvancedSettingsStore } from '@/stores/use-advanced-settings-store';

export function AdvancedTab() {
  const { t } = useLocale();
  const devMode = useAdvancedSettingsStore((state) => state.devMode);
  const setDevMode = useAdvancedSettingsStore((state) => state.setDevMode);
  const languagesQuery = useLanguages();
  const frameworksQuery = useFrameworks();
  const architecturesQuery = useArchitectures();
  const archetypesQuery = useArchetypes();

  return (
    <SettingsSection title={t('settings.advanced.title')} description={t('settings.advanced.description')} surface="none">
      <Card className="p-6">
        <SettingsToggleRow
          label={t('settings.advanced.devMode')}
          description={t('settings.advanced.devModeHint')}
          checked={devMode}
          onChange={setDevMode}
        />
      </Card>

      {devMode ? (
        <ArchitectureGraphSurface
          title={t('settings.contracts.title')}
          subtitle={t('settings.contracts.description')}
          nodes={[
            { label: t('settings.contracts.languages'), value: String(languagesQuery.data?.length ?? 0), detail: t('settings.contracts.languagesDetail'), tone: 'accent' },
            { label: t('settings.contracts.frameworks'), value: String(frameworksQuery.data?.length ?? 0), detail: t('settings.contracts.frameworksDetail'), tone: 'accent2' },
            { label: t('settings.contracts.architectures'), value: String(architecturesQuery.data?.length ?? 0), detail: t('settings.contracts.architecturesDetail'), tone: 'success' },
            { label: t('settings.contracts.archetypes'), value: String(archetypesQuery.data?.length ?? 0), detail: t('settings.contracts.archetypesDetail'), tone: 'muted' },
          ]}
        />
      ) : null}
    </SettingsSection>
  );
}
