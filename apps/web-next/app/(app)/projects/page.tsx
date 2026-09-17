import type { Metadata } from 'next';

import { ProjectsScreen } from './projects-screen';

export const metadata: Metadata = { title: 'Projects' };

export default function ProjectsPage() {
  return <ProjectsScreen />;
}
