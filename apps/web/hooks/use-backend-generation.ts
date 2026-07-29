'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type {
  BackendGenerationManifest,
  BackendGenerationRequest,
  BackendGenerationTemplateCatalog,
} from '@/lib/api/types';

export function useBackendGenerationPreview() {
  return useMutation<BackendGenerationManifest, Error, BackendGenerationRequest>({
    mutationFn: (payload) => apiClient.previewBackendGeneration(payload),
  });
}

export function useBackendGenerationRun() {
  const queryClient = useQueryClient();

  return useMutation<BackendGenerationManifest, Error, BackendGenerationRequest>({
    mutationFn: (payload) => apiClient.runBackendGeneration(payload),
    onSuccess: async (result, variables) => {
      if (result.status !== 'generated') return;
      await queryClient.invalidateQueries({ queryKey: ['api', 'projects'] });
      await queryClient.invalidateQueries({ queryKey: ['api', 'projects', variables.project_id] });
      await queryClient.invalidateQueries({ queryKey: ['api', 'generation-files', variables.project_id] });
    },
  });
}

export function useBackendGenerationTemplates() {
  return useQuery<BackendGenerationTemplateCatalog>({
    queryKey: ['api', 'backend-generation-templates'],
    queryFn: () => apiClient.getBackendGenerationTemplates(),
    staleTime: 30_000,
    retry: 1,
  });
}
