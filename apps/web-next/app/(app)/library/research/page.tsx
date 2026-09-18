import type { Metadata } from 'next';

import { ResearchScreen } from './research-screen';

export const metadata: Metadata = { title: 'Research' };

export default function Page() {
  return <ResearchScreen />;
}
