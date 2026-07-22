'use client';

import dynamic from 'next/dynamic';

import { useLocale } from '@/hooks/use-locale';

function MissionSelectorLoading() {
  const { t } = useLocale();
  return <div className="p-8 text-[color:var(--muted)]">{t('missions.loading')}</div>;
}

const MissionSelector = dynamic(
  () => import('@/modules/mission-workspace/components/MissionSelector').then((module) => module.MissionSelector),
  { loading: MissionSelectorLoading },
);

export default function MissionsPage() {
  return <MissionSelector />;
}
