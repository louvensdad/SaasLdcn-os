'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { BusinessModule } from '@/lib/api/types';

export function useBusinessModules() {
  return useQuery<BusinessModule[]>({
    queryKey: ['api', 'registry', 'business-modules'],
    queryFn: () => apiClient.getBusinessModules(),
    staleTime: 60_000,
    retry: 1,
  });
}
