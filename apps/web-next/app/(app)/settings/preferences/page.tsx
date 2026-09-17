import type { Metadata } from 'next';

import { PreferencesScreen } from './preferences-screen';

export const metadata: Metadata = { title: 'Preferences' };

export default function Page() {
  return <PreferencesScreen />;
}
