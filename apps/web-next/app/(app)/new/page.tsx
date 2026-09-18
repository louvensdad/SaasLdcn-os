import type { Metadata } from 'next';

import { StartScreen } from './start-screen';

export const metadata: Metadata = { title: 'Start' };

export default function Page() {
  return <StartScreen />;
}
