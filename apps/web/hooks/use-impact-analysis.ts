'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { DependencyGraphPayload, ImpactProfile } from '@/lib/api/types';

export function useImpactAnalysis(payload: DependencyGraphPayload | null) {
  const query = useQuery<ImpactProfile>({
    queryKey: ['api', 'dependency-graph', payload, 'impact'],
    queryFn: () =>
      apiClient.getDependencyGraphImpact(
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
