'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { GeneratedFileContentResponse } from '@/lib/api/types';

export function useGeneratedFileContent(projectId: string | null, path: string | null) {
  return useQuery<GeneratedFileContentResponse>({
    queryKey: ['api', 'generation-file-content', projectId, path],
    queryFn: () => apiClient.getGeneratedFileContent(projectId ?? '', path ?? ''),
    enabled: Boolean(projectId && path),
    staleTime: 5_000,
    retry: 0,
  });
}

