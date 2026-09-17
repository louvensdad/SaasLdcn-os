import type { Metadata } from 'next';

import { TermsScreen } from './terms-screen';

export const metadata: Metadata = { title: 'Terms & signals' };

export default function TermsPage() {
  return <TermsScreen />;
}
