'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { LocalGenerationRequest, LocalGenerationResult } from '@/lib/api/types';

export function useLocalGeneration() {
  const queryClient = useQueryClient();

  return useMutation<LocalGenerationResult, Error, LocalGenerationRequest>({
    mutationFn: (payload) => apiClient.runLocalGeneration(payload),
    onSuccess: async (result, variables) => {
      if (result.status !== 'generated') return;
      await queryClient.invalidateQueries({ queryKey: ['api', 'projects'] });
      await queryClient.invalidateQueries({ queryKey: ['api', 'projects', variables.project_id] });
      await queryClient.invalidateQueries({ queryKey: ['api', 'generation-files', variables.project_id] });
    },
  });
}
