import type { Metadata } from 'next';

import { AgentScreen } from './agent-screen';

export const metadata: Metadata = { title: 'Agent' };

export default async function AgentPage({ params }: {
  readonly params: Promise<{ readonly projectKey: string; readonly jobId: string; readonly instanceId: string }>;
}) {
  const { projectKey, jobId, instanceId } = await params;
  return <AgentScreen projectKey={decodeURIComponent(projectKey)} jobId={decodeURIComponent(jobId)} instanceId={decodeURIComponent(instanceId)} />;
}
