import type { Metadata } from 'next';

import { TestRoomScreen } from './test-room-screen';

export const metadata: Metadata = { title: 'Test Room' };

export default async function TestRoomPage({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <TestRoomScreen projectKey={decodeURIComponent(projectKey)} />;
}
