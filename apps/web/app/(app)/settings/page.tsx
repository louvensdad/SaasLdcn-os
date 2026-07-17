'use client';

import { Activity, Check, Code2, GitBranch, Palette, Sparkles, User } from 'lucide-react';

import { Tabs, type TabItem } from '@/components/ui/tabs';
import { SettingsOverview } from '@/components/settings/settings-overview';
import { AccountTab } from '@/components/settings/account-tab';
import { AiProvidersTab } from '@/components/settings/ai-providers-tab';
import { GitTab } from '@/components/settings/git-tab';
import { InterfaceTab } from '@/components/settings/interface-tab';
import { RuntimeTab } from '@/components/settings/runtime-tab';
import { AdvancedTab } from '@/components/settings/advanced-tab';
import { useSettingsDraftField } from '@/hooks/use-settings-draft-field';
import { useTopbarConfig } from '@/hooks/use-topbar-config';
import { useLocale } from '@/hooks/use-locale';
import { useShellStore } from '@/stores/use-shell-store';
import { ActivityFeed } from '@/components/settings/activity-feed';

export default function SettingsPage() {
  const { t } = useLocale();
  const density = useShellStore((state) => state.density);
  const setDensity = useShellStore((state) => state.setDensity);
  // Lifted to the page (not owned inside InterfaceTab): Tabs unmounts inactive
  // panels, so a draft living inside the tab itself would reset every time
  // the user switches away and back before saving.
  const densityDraft = useSettingsDraftField('interface.density', density, setDensity);

  useTopbarConfig({
    breadcrumb: [t('product.name'), t('sidebar.foundation'), t('settings.title')].map((part) => part.toUpperCase()),
    title: t('settings.title'),
    subtitle: t('settings.description'),
    primaryAction: {
      label: t('settings.saveBar.save'),
      icon: Check,
      onClick: densityDraft.save,
      loading: false,
    },
    secondaryText: t('settings.saveBar.autoSavedNote'),
  });

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
    <div className="space-y-6 pb-12">
      <SettingsOverview />
      <ActivityFeed />
      <Tabs items={items} defaultTab="account" queryParam="tab" />
    </div>
  );
}
