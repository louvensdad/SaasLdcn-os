'use client';

import { Activity, Code2, GitBranch, Palette, Sparkles, User } from 'lucide-react';

import { Tabs, type TabItem } from '@/components/ui/tabs';
import { SectionHeader } from '@/components/shell/section-header';
import { AccountTab } from '@/components/settings/account-tab';
import { AiProvidersTab } from '@/components/settings/ai-providers-tab';
import { GitTab } from '@/components/settings/git-tab';
import { InterfaceTab } from '@/components/settings/interface-tab';
import { RuntimeTab } from '@/components/settings/runtime-tab';
import { AdvancedTab } from '@/components/settings/advanced-tab';
import { SettingsSaveBar } from '@/components/settings/settings-save-bar';
import { useSettingsDraftField } from '@/hooks/use-settings-draft-field';
import { useLocale } from '@/hooks/use-locale';
import { useShellStore } from '@/stores/use-shell-store';

export default function SettingsPage() {
  const { t } = useLocale();
  const density = useShellStore((state) => state.density);
  const setDensity = useShellStore((state) => state.setDensity);
  // Lifted to the page (not owned inside InterfaceTab): Tabs unmounts inactive
  // panels, so a draft living inside the tab itself would reset every time
  // the user switches away and back before saving.
  const densityDraft = useSettingsDraftField('interface.density', density, setDensity);

  const items: TabItem[] = [
    { id: 'account', label: t('settings.tabs.account'), icon: User, content: <AccountTab /> },
    { id: 'ai', label: t('settings.tabs.ai'), icon: Sparkles, content: <AiProvidersTab /> },
    { id: 'git', label: t('settings.tabs.git'), icon: GitBranch, content: <GitTab /> },
    {
      id: 'interface',
      label: t('settings.tabs.interface'),
      icon: Palette,
      content: <InterfaceTab density={densityDraft.draft} onDensityChange={densityDraft.setDraft} />,
    },
    { id: 'runtime', label: t('settings.tabs.runtime'), icon: Activity, content: <RuntimeTab /> },
    { id: 'advanced', label: t('settings.tabs.advanced'), icon: Code2, content: <AdvancedTab /> },
  ];

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-24">
      <SectionHeader title={t('settings.title')} description={t('settings.description')} />
      <Tabs items={items} defaultTab="account" />
      <SettingsSaveBar onSaveAll={densityDraft.save} onDiscardAll={densityDraft.discard} />
    </div>
  );
}
