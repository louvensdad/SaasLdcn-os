import type { Metadata } from 'next';

import { CertificationScreen } from './certification-screen';

export const metadata: Metadata = { title: 'Certification Center' };

export default function CertificationPage() {
  return <CertificationScreen />;
}
