import type { Metadata } from 'next';

import { ReviewScreen } from './review-screen';

export const metadata: Metadata = { title: 'Engineering review' };

export default async function Page({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <ReviewScreen projectKey={decodeURIComponent(projectKey)} />;
}
