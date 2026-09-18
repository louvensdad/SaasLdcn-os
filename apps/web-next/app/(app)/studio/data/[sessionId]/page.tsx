import type { Metadata } from 'next';

import { DataSessionScreen } from './session-screen';

export const metadata: Metadata = { title: 'Data session' };

export default async function Page({ params }: { readonly params: Promise<{ readonly sessionId: string }> }) {
  const { sessionId } = await params;
  return <DataSessionScreen sessionId={decodeURIComponent(sessionId)} />;
}
