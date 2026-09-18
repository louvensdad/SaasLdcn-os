import type { Metadata } from 'next';

import { PlatformScreen } from './platform-screen';

export const metadata: Metadata = { title: 'Platform health' };

export default function Page() {
  return <PlatformScreen />;
}
