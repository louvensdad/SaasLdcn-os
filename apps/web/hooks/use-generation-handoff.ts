'use client';

import { useMutation } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { GenerationHandoffPackage, GenerationHandoffPreviewPayload } from '@/lib/api/types';

export function useGenerationHandoff() {
  return useMutation<GenerationHandoffPackage, Error, GenerationHandoffPreviewPayload>({
    mutationFn: (payload) => apiClient.previewGenerationHandoff(payload),
  });
}
