import type { Metadata } from 'next';

import { ChangeScreen } from './change-screen';

export const metadata: Metadata = { title: 'Change' };

export default async function ChangePage({ params }: {
  readonly params: Promise<{ readonly projectKey: string; readonly changeRequestId: string }>;
}) {
  const { projectKey, changeRequestId } = await params;
  return <ChangeScreen projectKey={decodeURIComponent(projectKey)} changeRequestId={decodeURIComponent(changeRequestId)} />;
}
