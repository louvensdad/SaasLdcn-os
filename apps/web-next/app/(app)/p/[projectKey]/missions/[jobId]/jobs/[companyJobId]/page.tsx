import type { Metadata } from 'next';

import { CompanyJobScreen } from './job-screen';

export const metadata: Metadata = { title: 'Company job' };

export default async function CompanyJobPage({ params }: {
  readonly params: Promise<{ readonly projectKey: string; readonly jobId: string; readonly companyJobId: string }>;
}) {
  const { projectKey, jobId, companyJobId } = await params;
  return <CompanyJobScreen projectKey={decodeURIComponent(projectKey)} jobId={decodeURIComponent(jobId)} companyJobId={decodeURIComponent(companyJobId)} />;
}
