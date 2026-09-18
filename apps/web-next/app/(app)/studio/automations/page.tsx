import type { Metadata } from 'next';

import { AutomationsScreen } from './automations-screen';

export const metadata: Metadata = { title: 'Automations' };

export default function Page() {
  return <AutomationsScreen />;
}
