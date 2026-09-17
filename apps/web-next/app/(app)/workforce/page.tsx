import type { Metadata } from 'next';

import { WorkforceScreen } from './workforce-screen';

export const metadata: Metadata = { title: 'Workforce' };

export default function WorkforcePage() {
  return <WorkforceScreen />;
}
