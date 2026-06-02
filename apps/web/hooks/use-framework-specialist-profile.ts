'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { FrameworkSpecialistProfile } from '@/lib/api/types';

export function useFrameworkSpecialistProfile(frameworkId: string | null) {
  const query = useQuery<FrameworkSpecialistProfile>({
    queryKey: ['api', 'framework-specialists', frameworkId, 'profile'],
    queryFn: () => apiClient.getFrameworkSpecialistProfile(frameworkId ?? ''),
    enabled: Boolean(frameworkId),
    staleTime: 60_000,
    retry: 1,
  });

  return {
    ...query,
    isEmpty: Boolean(frameworkId) && !query.isLoading && !query.isError && query.data == null,
  };
}
