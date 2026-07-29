'use client';

import { useMutation } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { GitExportJob, GitExportRequest } from '@/lib/api/types';

export function useGitExport() {
  return useMutation<GitExportJob, Error, GitExportRequest>({
    mutationFn: (payload) =>
      payload.provider === 'github'
        ? apiClient.exportToGithub(payload)
        : apiClient.exportToGitlab(payload),
  });
}
