'use client';

import { useMutation } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { BlueprintPreviewPayload, ProjectBlueprint } from '@/lib/api/types';

export function useBlueprintPreview() {
  return useMutation<ProjectBlueprint, Error, BlueprintPreviewPayload>({
    mutationFn: (payload) => apiClient.previewBlueprint(payload),
  });
}
