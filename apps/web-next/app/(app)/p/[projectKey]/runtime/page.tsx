import type { Metadata } from 'next';

import { RuntimeScreen } from './runtime-screen';

export const metadata: Metadata = { title: 'Runtime' };

export default async function Page({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <RuntimeScreen projectKey={decodeURIComponent(projectKey)} />;
}
