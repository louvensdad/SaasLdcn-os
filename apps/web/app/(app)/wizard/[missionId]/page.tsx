'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';

import { useLocale } from '@/hooks/use-locale';

function MissionWorkspaceLoading() {
  const { t } = useLocale();
  return <div className="p-8 text-[color:var(--muted)]">{t('missions.workspaceLoading')}</div>;
}

const MissionShell = dynamic(
  () => import('@/modules/mission-workspace/components/MissionShell').then((module) => module.MissionShell),
  { ssr: false, loading: MissionWorkspaceLoading },
);

export default function MissionWorkspacePage() {
  const { missionId } = useParams<{ missionId: string }>();
  return <MissionShell missionId={missionId} />;
}
