import type { Metadata } from 'next';

import { MarketplaceScreen } from './marketplace-screen';

export const metadata: Metadata = { title: 'Marketplace' };

export default function Page() {
  return <MarketplaceScreen />;
}
