import type { Metadata } from 'next';

import { ArchitectureScreen } from './architecture-screen';

export const metadata: Metadata = { title: 'Architecture' };

export default async function Page({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <ArchitectureScreen projectKey={decodeURIComponent(projectKey)} />;
}
