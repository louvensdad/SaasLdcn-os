'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { Architecture } from '@/lib/api/types';

export function useArchitectureLevels() {
  return useQuery<Architecture[]>({
    queryKey: ['api', 'registry', 'architectures'],
    queryFn: () => apiClient.getArchitectures(),
    staleTime: 60_000,
    retry: 1,
  });
}
