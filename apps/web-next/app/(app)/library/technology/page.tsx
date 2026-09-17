import type { Metadata } from 'next';

import { TechnologyScreen } from './technology-screen';

export const metadata: Metadata = { title: 'Technology' };

export default function Page() {
  return <TechnologyScreen />;
}
