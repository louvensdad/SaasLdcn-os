import type { Metadata } from 'next';

import { CockpitScreen } from './cockpit-screen';

export const metadata: Metadata = { title: 'Project Cockpit' };

export default async function ProjectCockpitPage({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <CockpitScreen projectKey={decodeURIComponent(projectKey)} />;
}
