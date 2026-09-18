import type { Metadata } from 'next';

import { ChangesScreen } from './changes-screen';

export const metadata: Metadata = { title: 'Changes' };

export default async function Page({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <ChangesScreen projectKey={decodeURIComponent(projectKey)} />;
}
