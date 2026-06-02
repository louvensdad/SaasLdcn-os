'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { Stack } from '@/lib/api/types';

export function useStacks() {
  return useQuery<Stack[]>({
    queryKey: ['api', 'stacks'],
    queryFn: () => apiClient.getStacks(),
    staleTime: 60_000,
    retry: 1,
  });
}
