'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { GeneratedProjectFilesResponse } from '@/lib/api/types';

export function useGeneratedFiles(projectId: string | null) {
  return useQuery<GeneratedProjectFilesResponse>({
    queryKey: ['api', 'generation-files', projectId],
    queryFn: () => apiClient.getGeneratedFiles(projectId ?? ''),
    enabled: Boolean(projectId),
    staleTime: 5_000,
    retry: 1,
  });
}

