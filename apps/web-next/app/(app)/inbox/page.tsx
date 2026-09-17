import type { Metadata } from 'next';

import { InboxScreen } from './inbox-screen';

export const metadata: Metadata = { title: 'Action Center' };

export default function InboxPage() {
  return <InboxScreen />;
}
