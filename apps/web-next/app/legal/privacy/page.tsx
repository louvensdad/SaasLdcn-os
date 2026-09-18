import type { Metadata } from 'next';

import { LegalScreen } from '../legal-screen';

export const metadata: Metadata = { title: 'Privacy policy' };

export default function Page() {
  return <LegalScreen document="privacy" />;
}
