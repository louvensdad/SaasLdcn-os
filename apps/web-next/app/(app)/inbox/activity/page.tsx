import type { Metadata } from 'next';

import { ActivityScreen } from './activity-screen';

export const metadata: Metadata = { title: 'Activity' };

export default function ActivityPage() {
  return <ActivityScreen />;
}
