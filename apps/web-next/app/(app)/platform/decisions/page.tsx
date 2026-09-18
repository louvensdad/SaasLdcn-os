import type { Metadata } from 'next';

import { DecisionTracesScreen } from './decisions-screen';

export const metadata: Metadata = { title: 'Decision traces' };

export default function Page() {
  return <DecisionTracesScreen />;
}
