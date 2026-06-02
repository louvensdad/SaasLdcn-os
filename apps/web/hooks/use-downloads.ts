'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { DownloadRecord } from '@/lib/api/types';

export function useDownloads() {
  return useQuery<DownloadRecord[]>({
    queryKey: ['api', 'downloads'],
    queryFn: () => apiClient.getDownloads(),
    staleTime: 30_000,
    retry: 1,
  });
}
