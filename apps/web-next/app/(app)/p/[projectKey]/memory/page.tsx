import type { Metadata } from 'next';

import { MemoryScreen } from './memory-screen';

export const metadata: Metadata = { title: 'Project memory' };

export default async function Page({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <MemoryScreen projectKey={decodeURIComponent(projectKey)} />;
}
