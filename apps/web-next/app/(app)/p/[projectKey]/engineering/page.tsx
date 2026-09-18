import type { Metadata } from 'next';

import { EngineeringScreen } from './engineering-screen';

export const metadata: Metadata = { title: 'Engineering' };

export default async function Page({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <EngineeringScreen projectKey={decodeURIComponent(projectKey)} />;
}
