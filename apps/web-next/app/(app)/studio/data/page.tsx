import type { Metadata } from 'next';

import { DataScreen } from './data-screen';

export const metadata: Metadata = { title: 'Data studio' };

export default function Page() {
  return <DataScreen />;
}
