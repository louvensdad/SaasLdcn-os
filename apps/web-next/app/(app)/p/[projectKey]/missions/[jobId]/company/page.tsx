import type { Metadata } from 'next';

import { CompanyScreen } from './company-screen';

export const metadata: Metadata = { title: 'Virtual Company' };

export default async function CompanyPage({ params }: { readonly params: Promise<{ readonly projectKey: string; readonly jobId: string }> }) {
  const { projectKey, jobId } = await params;
  return <CompanyScreen projectKey={decodeURIComponent(projectKey)} jobId={decodeURIComponent(jobId)} />;
}
