import type { Metadata } from 'next';

import { PlannerScreen } from './planner-screen';

export const metadata: Metadata = { title: 'Workforce planner' };

export default function WorkforcePlannerPage() {
  return <PlannerScreen />;
}
