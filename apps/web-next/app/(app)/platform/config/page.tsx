import type { Metadata } from 'next';

import { RuntimeConfigScreen } from './config-screen';

export const metadata: Metadata = { title: 'Runtime configuration' };

export default function Page() {
  return <RuntimeConfigScreen />;
}
