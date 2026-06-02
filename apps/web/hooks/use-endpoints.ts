'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { RegistryEndpoint } from '@/lib/api/types';

export function useEndpoints() {
  return useQuery<RegistryEndpoint[]>({
    queryKey: ['api', 'registry', 'endpoints'],
    queryFn: () => apiClient.getRegistryEndpoints(),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useModuleEndpoints(moduleId: string | null) {
  return useQuery<RegistryEndpoint[]>({
    queryKey: ['api', 'registry', 'business-modules', moduleId, 'endpoints'],
    queryFn: () => apiClient.getModuleEndpoints(moduleId ?? ''),
    enabled: Boolean(moduleId),
    staleTime: 60_000,
    retry: 1,
  });
}
