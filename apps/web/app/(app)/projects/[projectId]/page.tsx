'use client';

import { useParams } from 'next/navigation';

import { ProjectExperienceV2 } from '@/components/project/project-experience-v2';

export default function ProjectDetailPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = typeof params.projectId === 'string' ? params.projectId : null;
  return <ProjectExperienceV2 projectId={projectId} />;
}