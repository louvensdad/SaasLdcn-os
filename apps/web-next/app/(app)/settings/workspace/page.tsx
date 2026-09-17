import type { Metadata } from 'next';

import { WorkspaceSettingsScreen } from './workspace-settings-screen';

export const metadata: Metadata = { title: 'Workspace' };

export default function Page() {
  return <WorkspaceSettingsScreen />;
}
