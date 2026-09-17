import type { Metadata } from 'next';

import { MissionsScreen } from './missions-screen';

export const metadata: Metadata = { title: 'Missions' };

export default async function ProjectMissionsPage({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <MissionsScreen projectKey={decodeURIComponent(projectKey)} />;
}
