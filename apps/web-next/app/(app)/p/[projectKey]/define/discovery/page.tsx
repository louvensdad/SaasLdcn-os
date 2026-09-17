import type { Metadata } from 'next';

import { DiscoveryScreen } from './discovery-screen';

export const metadata: Metadata = { title: 'Discovery' };

export default async function Page({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <DiscoveryScreen projectKey={decodeURIComponent(projectKey)} />;
}
