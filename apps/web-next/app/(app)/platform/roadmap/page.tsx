import type { Metadata } from 'next';

import { RoadmapScreen } from './roadmap-screen';

export const metadata: Metadata = { title: 'Roadmap' };

export default function Page() {
  return <RoadmapScreen />;
}
