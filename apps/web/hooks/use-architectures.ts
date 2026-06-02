'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { Architecture } from '@/lib/api/types';

export function useArchitectures() {
  return useQuery<Architecture[]>({
    queryKey: ['api', 'registry', 'architectures'],
    queryFn: () => apiClient.getArchitectures(),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useFrameworkArchitectures(frameworkId: string | null) {
  return useQuery<Architecture[]>({
    queryKey: ['api', 'registry', 'frameworks', frameworkId, 'architectures'],
    queryFn: () => apiClient.getFrameworkArchitectures(frameworkId ?? ''),
    enabled: Boolean(frameworkId),
    staleTime: 60_000,
    retry: 1,
  });
}
