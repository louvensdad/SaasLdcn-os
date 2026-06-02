'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { DependencyGraphPayload, DependencyGraphSnapshot } from '@/lib/api/types';

export function useDependencyGraph(payload: DependencyGraphPayload | null) {
  const query = useQuery<DependencyGraphSnapshot>({
    queryKey: ['api', 'dependency-graph', payload],
    queryFn: () =>
      apiClient.getDependencyGraphPreview(
        payload ?? {
          language_id: '',
          framework_id: '',
          architecture_id: '',
          capability_ids: [],
          infrastructure_ids: [],
          archetype_id: null,
        },
      ),
    enabled: Boolean(payload),
    staleTime: 30_000,
    retry: 1,
  });

  return {
    ...query,
    isEmpty: Boolean(payload) && !query.isLoading && !query.isError && query.data == null,
  };
}
