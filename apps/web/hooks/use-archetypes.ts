'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { Archetype } from '@/lib/api/types';

export function useArchetypes() {
  return useQuery<Archetype[]>({
    queryKey: ['api', 'registry', 'archetypes'],
    queryFn: () => apiClient.getArchetypes(),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useStackArchetypes(stackId: string | null) {
  return useQuery<Archetype[]>({
    queryKey: ['api', 'registry', 'stacks', stackId, 'archetypes'],
    queryFn: () => apiClient.getStackArchetypes(stackId ?? ''),
    enabled: Boolean(stackId),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useFrameworkArchetypes(frameworkId: string | null) {
  return useQuery<Archetype[]>({
    queryKey: ['api', 'registry', 'frameworks', frameworkId, 'archetypes'],
    queryFn: () => apiClient.getFrameworkArchetypes(frameworkId ?? ''),
    enabled: Boolean(frameworkId),
    staleTime: 60_000,
    retry: 1,
  });
}
