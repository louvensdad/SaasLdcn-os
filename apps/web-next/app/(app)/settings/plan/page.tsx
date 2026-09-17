import type { Metadata } from 'next';

import { PlanScreen } from './plan-screen';

export const metadata: Metadata = { title: 'Plan and usage' };

export default function Page() {
  return <PlanScreen />;
}
