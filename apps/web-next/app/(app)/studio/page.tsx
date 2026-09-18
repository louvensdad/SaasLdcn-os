import type { Metadata } from 'next';

import { StudioScreen } from './studio-screen';

export const metadata: Metadata = { title: 'Studios' };

export default function Page() {
  return <StudioScreen />;
}
