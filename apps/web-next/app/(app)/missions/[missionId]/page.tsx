import type { Metadata } from 'next';

import { GuidedMissionScreen } from './guided-mission-screen';

export const metadata: Metadata = { title: 'Mission' };

export default async function Page({ params }: { readonly params: Promise<{ readonly missionId: string }> }) {
  const { missionId } = await params;
  return <GuidedMissionScreen missionId={decodeURIComponent(missionId)} />;
}
