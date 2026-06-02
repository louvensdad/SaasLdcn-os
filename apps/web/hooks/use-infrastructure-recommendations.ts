'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { InfrastructureRecommendation, InfrastructureRecommendationPayload } from '@/lib/api/types';

export function useInfrastructureRecommendations(payload: InfrastructureRecommendationPayload | null) {
  const query = useQuery<InfrastructureRecommendation>({
    queryKey: ['api', 'infrastructure', 'recommendations', payload],
    queryFn: () => apiClient.getInfrastructureRecommendations(payload ?? {
      language_id: '',
      framework_id: '',
      architecture_id: '',
      archetype_id: '',
      capability_ids: [],
      architecture_level: '',
    }),
    enabled: Boolean(payload),
    staleTime: 30_000,
    retry: 1,
  });

  return {
    ...query,
    isEmpty: Boolean(payload) && !query.isLoading && !query.isError && query.data == null,
  };
}

