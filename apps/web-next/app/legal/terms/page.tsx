import type { Metadata } from 'next';

import { LegalScreen } from '../legal-screen';

export const metadata: Metadata = { title: 'Terms of use' };

export default function Page() {
  return <LegalScreen document="terms" />;
}
