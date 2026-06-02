'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { FrameworkReadinessProfile } from '@/lib/api/types';

export function useFrameworkReadiness(frameworkId: string | null) {
  const query = useQuery<FrameworkReadinessProfile>({
    queryKey: ['api', 'framework-specialists', frameworkId, 'readiness'],
    queryFn: () => apiClient.getFrameworkReadiness(frameworkId ?? ''),
    enabled: Boolean(frameworkId),
    staleTime: 60_000,
    retry: 1,
  });

  return {
    ...query,
    isEmpty: Boolean(frameworkId) && !query.isLoading && !query.isError && query.data == null,
  };
}
