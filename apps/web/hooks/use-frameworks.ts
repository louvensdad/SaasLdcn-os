'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { Framework } from '@/lib/api/types';

export function useFrameworks() {
  return useQuery<Framework[]>({
    queryKey: ['api', 'registry', 'frameworks'],
    queryFn: () => apiClient.getFrameworks(),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useLanguageFrameworks(languageId: string | null) {
  const query = useQuery<Framework[]>({
    queryKey: ['api', 'language-domains', languageId, 'frameworks'],
    queryFn: () => apiClient.getLanguageFrameworks(languageId ?? ''),
    enabled: Boolean(languageId),
    staleTime: 60_000,
    retry: 1,
  });

  return {
    ...query,
    isEmpty: Boolean(languageId) && !query.isLoading && !query.isError && (query.data?.length ?? 0) === 0,
  };
}
