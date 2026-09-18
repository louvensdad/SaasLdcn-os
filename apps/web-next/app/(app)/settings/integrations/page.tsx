import type { Metadata } from 'next';

import { IntegrationsScreen } from './integrations-screen';

export const metadata: Metadata = { title: 'Integrations' };

export default function Page() {
  return <IntegrationsScreen />;
}
