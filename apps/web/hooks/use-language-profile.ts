'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { LanguageDomainProfile } from '@/lib/api/types';

export function useLanguageProfile(languageId: string | null) {
  const query = useQuery<LanguageDomainProfile>({
    queryKey: ['api', 'language-domains', languageId, 'profile'],
    queryFn: () => apiClient.getLanguageProfile(languageId ?? ''),
    enabled: Boolean(languageId),
    staleTime: 60_000,
    retry: 1,
  });

  return {
    ...query,
    isEmpty: Boolean(languageId) && !query.isLoading && !query.isError && (query.data == null),
  };
}
