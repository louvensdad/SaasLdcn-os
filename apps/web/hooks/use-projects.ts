'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import { queryKeys } from '@/lib/api/query-keys';
import { useAppMutation } from '@/hooks/use-app-mutation';
import type { Project, SaveProjectFromWizardPayload, UpdateProjectPayload } from '@/lib/api/types';

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: queryKeys.projects,
    queryFn: () => apiClient.getProjects(),
    staleTime: 10_000,
    retry: 1,
  });
}

export function useProject(projectId: string | null) {
  return useQuery<Project>({
    queryKey: queryKeys.project(projectId ?? ''),
    queryFn: () => apiClient.getProject(projectId ?? ''),
    enabled: Boolean(projectId),
    staleTime: 10_000,
    retry: 1,
  });
}

export function useSaveProjectFromWizard() {
  const queryClient = useQueryClient();

  return useAppMutation<Project, SaveProjectFromWizardPayload>({
    mutationFn: (payload) => apiClient.saveProjectFromWizard(payload),
    invalidateKeys: [queryKeys.projects],
    logLabel: 'projects.saveFromWizard',
    onSuccess: (savedProject) => {
      // Optimistic merge so the list reflects the new/updated project the
      // instant the mutation resolves, before the invalidation refetch lands.
      queryClient.setQueryData<Project[]>(queryKeys.projects, (current = []) => [
        savedProject,
        ...current.filter((project) => project.project_id !== savedProject.project_id),
      ]);
    },
  });
}

export function useUpdateProject(projectId: string) {
  return useAppMutation<Project, UpdateProjectPayload>({
    mutationFn: (payload) => apiClient.updateProject(projectId, payload),
    invalidateKeys: [queryKeys.projects, queryKeys.project(projectId)],
    logLabel: 'projects.update',
  });
}

export function useDeleteProject(projectId: string) {
  const queryClient = useQueryClient();

  return useAppMutation<void, void>({
    mutationFn: () => apiClient.deleteProject(projectId),
    invalidateKeys: [queryKeys.projects],
    logLabel: 'projects.delete',
    onSuccess: () => {
      queryClient.setQueryData<Project[]>(queryKeys.projects, (current = []) =>
        current.filter((project) => project.project_id !== projectId),
      );
      queryClient.removeQueries({ queryKey: queryKeys.project(projectId) });
    },
  });
}
