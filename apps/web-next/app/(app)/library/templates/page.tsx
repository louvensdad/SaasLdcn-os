import type { Metadata } from 'next';

import { TemplatesScreen } from './templates-screen';

export const metadata: Metadata = { title: 'Templates & skills' };

export default function Page() {
  return <TemplatesScreen />;
}
