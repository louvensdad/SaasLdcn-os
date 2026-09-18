import type { Metadata } from 'next';

import { ModernizeScreen } from './modernize-screen';

export const metadata: Metadata = { title: 'Modernization' };

export default async function Page({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <ModernizeScreen projectKey={decodeURIComponent(projectKey)} />;
}
