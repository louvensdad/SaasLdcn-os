'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { Archetype } from '@/lib/api/types';

export function useLanguageArchetypes(languageId: string | null) {
  const query = useQuery<Archetype[]>({
    queryKey: ['api', 'language-domains', languageId, 'archetypes'],
    queryFn: () => apiClient.getLanguageArchetypes(languageId ?? ''),
    enabled: Boolean(languageId),
    staleTime: 60_000,
    retry: 1,
  });

  return {
    ...query,
    isEmpty: Boolean(languageId) && !query.isLoading && !query.isError && (query.data?.length ?? 0) === 0,
  };
}
