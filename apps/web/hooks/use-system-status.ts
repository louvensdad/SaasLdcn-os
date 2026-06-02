'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { SystemStatusResponse } from '@/lib/api/types';

export function useSystemStatus() {
  return useQuery<SystemStatusResponse>({
    queryKey: ['api', 'system-status'],
    queryFn: () => apiClient.getSystemStatus(),
    staleTime: 30_000,
    retry: 1,
  });
}
