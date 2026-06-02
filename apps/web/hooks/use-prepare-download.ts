'use client';

import { useMutation } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { PreparedDownloadResponse } from '@/lib/api/types';

export function usePrepareDownload(projectId: string | null) {
  return useMutation<PreparedDownloadResponse, Error>({
    mutationFn: () => apiClient.prepareGeneratedDownload(projectId ?? ''),
  });
}

