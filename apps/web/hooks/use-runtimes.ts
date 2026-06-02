'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { Runtime } from '@/lib/api/types';

export function useRuntimes() {
  return useQuery<Runtime[]>({
    queryKey: ['api', 'registry', 'runtimes'],
    queryFn: () => apiClient.getRuntimes(),
    staleTime: 60_000,
    retry: 1,
  });
}
