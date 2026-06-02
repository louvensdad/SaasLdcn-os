'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { Capability } from '@/lib/api/types';

export function useLanguageCapabilities(languageId: string | null) {
  const query = useQuery<Capability[]>({
    queryKey: ['api', 'language-domains', languageId, 'capabilities'],
    queryFn: () => apiClient.getLanguageCapabilities(languageId ?? ''),
    enabled: Boolean(languageId),
    staleTime: 60_000,
    retry: 1,
  });

  return {
    ...query,
    isEmpty: Boolean(languageId) && !query.isLoading && !query.isError && (query.data?.length ?? 0) === 0,
  };
}
