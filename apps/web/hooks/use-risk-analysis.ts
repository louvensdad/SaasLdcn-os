'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { DependencyGraphPayload, RiskProfile } from '@/lib/api/types';

export function useRiskAnalysis(payload: DependencyGraphPayload | null) {
  const query = useQuery<RiskProfile>({
    queryKey: ['api', 'dependency-graph', payload, 'risks'],
    queryFn: () =>
      apiClient.getDependencyGraphRisks(
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
