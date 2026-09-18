import type { Metadata } from 'next';

import { DeliveryScreen } from './delivery-screen';

export const metadata: Metadata = { title: 'Delivery' };

export default async function DeliveryPage({ params }: { readonly params: Promise<{ readonly projectKey: string }> }) {
  const { projectKey } = await params;
  return <DeliveryScreen projectKey={decodeURIComponent(projectKey)} />;
}
