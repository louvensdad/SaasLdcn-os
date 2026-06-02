'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { Language } from '@/lib/api/types';

export function useLanguages() {
  return useQuery<Language[]>({
    queryKey: ['api', 'registry', 'languages'],
    queryFn: () => apiClient.getLanguages(),
    staleTime: 60_000,
    retry: 1,
  });
}
