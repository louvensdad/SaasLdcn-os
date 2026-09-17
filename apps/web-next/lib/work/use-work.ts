'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { api } from '@/lib/api/api';

import { deriveDecisions } from './decisions';
import { deriveProjects } from './projects';

/** The reads the command layer composes, with each failure kept visible instead of averaged away. */
export function useWork() {
  const rooms = useQuery({ queryKey: ['project-rooms'], queryFn: api.projectRooms });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs });
  const changes = useQuery({ queryKey: ['change-requests'], queryFn: api.changeRequests });
  const records = useQuery({ queryKey: ['projects'], queryFn: api.projects });

  const decisions = useMemo(
    () => deriveDecisions({ rooms: rooms.data, jobs: jobs.data, changes: changes.data }),
    [rooms.data, jobs.data, changes.data],
  );
  const projects = useMemo(() => deriveProjects(rooms.data, jobs.data, records.data), [rooms.data, jobs.data, records.data]);

  const unreadable = [
    rooms.isError ? 'GET /api/project-rooms' : null,
    jobs.isError ? 'GET /api/meta-factory/jobs' : null,
    changes.isError ? 'GET /api/change-requests' : null,
    records.isError ? 'GET /api/projects' : null,
  ].filter((entry): entry is string => entry !== null);

  return {
    rooms,
    jobs,
    changes,
    records,
    decisions,
    projects,
    unreadable,
    pending: rooms.isPending || jobs.isPending || changes.isPending,
  };
}
