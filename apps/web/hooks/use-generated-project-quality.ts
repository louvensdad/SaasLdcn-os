'use client';

import { useMutation } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { GeneratedProjectQualityResponse } from '@/lib/api/types';

export function useGeneratedProjectQuality(projectId: string | null) {
  return useMutation<GeneratedProjectQualityResponse, Error>({
    mutationFn: () => {
      if (!projectId) throw new Error('Project id is required.');
      return apiClient.runGeneratedProjectQualityCheck(projectId);
    },
  });
}
