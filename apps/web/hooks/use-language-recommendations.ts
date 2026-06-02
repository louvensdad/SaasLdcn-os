'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { LanguageDomainRecommendation } from '@/lib/api/types';

export function useLanguageRecommendations(languageId: string | null) {
  const query = useQuery<LanguageDomainRecommendation[]>({
    queryKey: ['api', 'language-domains', languageId, 'recommendations'],
    queryFn: () => apiClient.getLanguageRecommendations(languageId ?? ''),
    enabled: Boolean(languageId),
    staleTime: 60_000,
    retry: 1,
  });

  return {
    ...query,
    isEmpty: Boolean(languageId) && !query.isLoading && !query.isError && (query.data?.length ?? 0) === 0,
  };
}
