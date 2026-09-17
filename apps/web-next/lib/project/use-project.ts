'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '@/lib/api/api';
import { isRunning } from '@/lib/status';

/**
 * One project across the identities the backend keeps for it (NEXT-FRONTEND-ROUTE-MODEL.md §2): the room id is the
 * key in the URL, the generated project id is discovered from the missions, and a legacy `projects` row answers when
 * the key is not a room. Nothing here invents an aggregate the backend does not have (gap G5) — it names its reads.
 */
export function useProject(projectKey: string) {
  const room = useQuery({ queryKey: ['room', projectKey], queryFn: () => api.room(projectKey), retry: false });
  const abstract = useQuery({
    queryKey: ['room-abstract', projectKey],
    queryFn: () => api.roomAbstractState(projectKey),
    retry: false,
    enabled: room.isSuccess,
  });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs });
  /** Only asked for when the key is not a room: the legacy row is the other identity a key can have. */
  const record = useQuery({ queryKey: ['project', projectKey], queryFn: () => api.project(projectKey), retry: false, enabled: room.isError });

  const missions = useMemo(
    () => (jobs.data ?? []).filter((job) => job.projectId === projectKey).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [jobs.data, projectKey],
  );
  const latest = missions[0];
  const running = missions.find((job) => !job.archived && isRunning(job.status));
  const generatedProjectId = useMemo(
    () => missions.map((job) => job.generatedProjectId).find((value): value is string => Boolean(value)) ?? record.data?.project_id ?? null,
    [missions, record.data],
  );

  const kernel = useQuery({
    queryKey: ['kernel', generatedProjectId],
    queryFn: () => api.kernel(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
  const delivery = useQuery({
    queryKey: ['delivery', generatedProjectId],
    queryFn: () => api.deliveryDecision(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });

  const name = room.data?.title ?? record.data?.project_name ?? projectKey;
  const unreadable = [
    room.isError && record.isError ? `GET /api/project-rooms/${projectKey}` : null,
    jobs.isError ? 'GET /api/meta-factory/jobs' : null,
    kernel.isError ? `GET /api/meta-factory/${generatedProjectId}/engineering-kernel` : null,
    delivery.isError ? `GET /api/meta-factory/${generatedProjectId}/delivery` : null,
  ].filter((entry): entry is string => entry !== null);

  return {
    projectKey,
    name,
    room,
    abstract,
    record,
    jobs,
    missions,
    latest,
    running,
    generatedProjectId,
    kernel,
    delivery,
    unreadable,
    pending: room.isPending || jobs.isPending,
    /** The name is still the key only because the reads that can name the project have not answered yet. */
    naming: room.isPending || (room.isError && record.isPending),
    /** True when neither identity answered: the key is not a project this account can read. */
    missing: room.isError && record.isError,
  };
}

export type ProjectData = ReturnType<typeof useProject>;
