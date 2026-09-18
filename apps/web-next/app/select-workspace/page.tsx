import type { Metadata } from 'next';
import { Suspense } from 'react';

import { WorkspaceScreen } from './workspace-screen';

export const metadata: Metadata = { title: 'Choose a workspace' };

export default function SelectWorkspacePage() {
  return (
    <Suspense fallback={null}>
      <WorkspaceScreen />
    </Suspense>
  );
}
