'use client';

import { useMutation } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { PromptMasterDocument, PromptMasterPreviewPayload } from '@/lib/api/types';

export function usePromptMasterPreview() {
  return useMutation<PromptMasterDocument, Error, PromptMasterPreviewPayload>({
    mutationFn: (payload) => apiClient.previewPromptMaster(payload),
  });
}
