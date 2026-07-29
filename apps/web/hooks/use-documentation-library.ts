'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type {
  DocumentationExportResponse,
  DocumentationGenerateRequest,
  DocumentationGenerateResponse,
  DocumentationLibraryResponse,
  DocumentationSaveRequest,
  DocumentationSaveResponse,
} from '@/lib/api/types';

export function useDocumentationLibrary(projectId: string | null) {
  return useQuery<DocumentationLibraryResponse>({
    queryKey: ['api', 'documentation', projectId],
    queryFn: () => apiClient.getProjectDocumentation(projectId ?? ''),
    enabled: Boolean(projectId),
    staleTime: 5_000,
    retry: 1,
  });
}

export function useDocumentationExport(projectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<DocumentationExportResponse, Error, boolean | void>({
    mutationFn: (organize) => {
      if (!projectId) throw new Error('Project id is required.');
      return apiClient.exportProjectDocumentation(projectId, Boolean(organize));
    },
    onSuccess: () => {
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['api', 'documentation', projectId] });
      }
    },
  });
}

export function useDocumentationGenerate(projectId: string | null) {
  return useMutation<DocumentationGenerateResponse, Error, DocumentationGenerateRequest | void>({
    mutationFn: (body) => {
      if (!projectId) throw new Error('Project id is required.');
      return apiClient.generateProjectDocumentation(projectId, body ?? {});
    },
  });
}

export function useDocumentationSave(projectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<DocumentationSaveResponse, Error, DocumentationSaveRequest>({
    mutationFn: (body) => {
      if (!projectId) throw new Error('Project id is required.');
      return apiClient.saveProjectDocumentation(projectId, body);
    },
    onSuccess: () => {
      if (projectId) {
        queryClient.invalidateQueries({ queryKey: ['api', 'documentation', projectId] });
      }
    },
  });
}
