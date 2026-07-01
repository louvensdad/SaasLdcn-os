'use client';

import { useEffect } from 'react';

import { PlatformMap } from '@/components/platform/platform-map';
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
      <PlatformMap />
    </div>
  );
}
