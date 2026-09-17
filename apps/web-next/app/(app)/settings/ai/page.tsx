import type { Metadata } from 'next';

import { AiSettingsScreen } from './ai-screen';

export const metadata: Metadata = { title: 'AI providers' };

export default function Page() {
  return <AiSettingsScreen />;
}
