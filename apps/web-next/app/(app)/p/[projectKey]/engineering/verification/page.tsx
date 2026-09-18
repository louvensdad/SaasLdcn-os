import type { Metadata } from 'next';

import { VerificationScreen } from './verification-screen';

export const metadata: Metadata = { title: 'Verification' };

export default async function Page({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <VerificationScreen projectKey={decodeURIComponent(projectKey)} />;
}
