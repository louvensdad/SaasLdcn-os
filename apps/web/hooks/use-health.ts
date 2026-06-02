'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { HealthResponse } from '@/lib/api/types';

export function useHealth() {
  return useQuery<HealthResponse>({
    queryKey: ['api', 'health'],
    queryFn: () => apiClient.getHealth(),
    retry: 1,
    staleTime: 15_000,
  });
}
