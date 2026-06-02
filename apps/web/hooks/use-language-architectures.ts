'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { Architecture } from '@/lib/api/types';

export function useLanguageArchitectures(languageId: string | null) {
  const query = useQuery<Architecture[]>({
    queryKey: ['api', 'language-domains', languageId, 'architectures'],
    queryFn: () => apiClient.getLanguageArchitectures(languageId ?? ''),
    enabled: Boolean(languageId),
    staleTime: 60_000,
    retry: 1,
  });

  return {
    ...query,
    isEmpty: Boolean(languageId) && !query.isLoading && !query.isError && (query.data?.length ?? 0) === 0,
  };
}
