import type { Metadata } from 'next';

import { KnowledgeScreen } from './knowledge-screen';

export const metadata: Metadata = { title: 'Knowledge' };

export default function Page() {
  return <KnowledgeScreen />;
}
