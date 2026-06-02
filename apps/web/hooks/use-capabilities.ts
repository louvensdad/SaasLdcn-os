'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { Capability } from '@/lib/api/types';

export function useCapabilities() {
  return useQuery<Capability[]>({
    queryKey: ['api', 'registry', 'capabilities'],
    queryFn: () => apiClient.getCapabilities(),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useStackCapabilities(stackId: string | null) {
  return useQuery<Capability[]>({
    queryKey: ['api', 'registry', 'stacks', stackId, 'capabilities'],
    queryFn: () => apiClient.getStackCapabilities(stackId ?? ''),
    enabled: Boolean(stackId),
    staleTime: 60_000,
    retry: 1,
  });
}
