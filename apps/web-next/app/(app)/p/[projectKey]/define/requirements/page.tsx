import type { Metadata } from 'next';

import { RequirementsScreen } from './requirements-screen';

export const metadata: Metadata = { title: 'Requirements' };

export default async function Page({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <RequirementsScreen projectKey={decodeURIComponent(projectKey)} />;
}
