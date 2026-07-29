'use client';

import { useEffect } from 'react';

import { PlatformOverview } from '@/components/platform/platform-overview';
import { CommandCanvas } from '@/components/platform/command-canvas';
import { SilentIntelligencePanel } from '@/components/ldcn/silent-intelligence-panel';
import { useLDCNStore } from '@/stores/use-ldcn-store';
import { useLocale } from '@/hooks/use-locale';

export default function PlatformPage() {
  const { t } = useLocale();
  const setPresenceState = useLDCNStore((state) => state.setPresenceState);
  const setContext = useLDCNStore((state) => state.setContext);

  useEffect(() => {
    setPresenceState('observing');
    setContext({
      route: '/platform',
      page_title: t('platform.title'),
      current_phase: t('platform.title'),
      pipeline: {
        route: '/platform',
        phase: t('platform.title'),
        status: 'ready',
        readiness_label: t('platform.subtitle'),
        detail: t('platform.coreHint'),
      },
      status: 'observing',
      summary: t('platform.subtitle'),
      suggestions: [],
    });
  }, [setContext, setPresenceState, t]);

  return (
    <div className="py-4">
      <CommandCanvas />
      <PlatformOverview />
      <SilentIntelligencePanel />
    </div>
  );
}
