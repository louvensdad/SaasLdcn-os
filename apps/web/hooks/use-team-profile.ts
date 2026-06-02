'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { EngineeringReadinessPayload, TeamRecommendation } from '@/lib/api/types';

export function useTeamProfile(payload: EngineeringReadinessPayload | null) {
  const query = useQuery<TeamRecommendation>({
    queryKey: ['api', 'engineering', payload, 'team-profile'],
    queryFn: () =>
      apiClient.getEngineeringTeamProfile(
        payload ?? {
          language_id: '',
          framework_id: '',
          architecture_id: '',
          capability_ids: [],
          infrastructure_ids: [],
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
