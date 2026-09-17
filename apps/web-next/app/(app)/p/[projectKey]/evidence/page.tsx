import type { Metadata } from 'next';

import { EvidenceScreen } from './evidence-screen';

export const metadata: Metadata = { title: 'Evidence' };

export default async function EvidencePage({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <EvidenceScreen projectKey={decodeURIComponent(projectKey)} />;
}
