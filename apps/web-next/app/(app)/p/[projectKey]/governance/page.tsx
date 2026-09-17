import type { Metadata } from 'next';

import { GovernanceScreen } from './governance-screen';

export const metadata: Metadata = { title: 'Governance' };

export default async function Page({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <GovernanceScreen projectKey={decodeURIComponent(projectKey)} />;
}
