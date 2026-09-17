import type { Metadata } from 'next';

import { MissionScreen } from './mission-screen';

export const metadata: Metadata = { title: 'Mission Command Center' };

export default async function MissionPage({ params }: { readonly params: Promise<{ readonly projectKey: string; readonly jobId: string }> }) {
  const { projectKey, jobId } = await params;
  return <MissionScreen projectKey={decodeURIComponent(projectKey)} jobId={decodeURIComponent(jobId)} />;
}
