'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { Project, SaveProjectFromWizardPayload, UpdateProjectPayload } from '@/lib/api/types';

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['api', 'projects'],
    queryFn: () => apiClient.getProjects(),
    staleTime: 10_000,
    retry: 1,
  });
}

export function useProject(projectId: string | null) {
  return useQuery<Project>({
    queryKey: ['api', 'projects', projectId],
    queryFn: () => apiClient.getProject(projectId ?? ''),
    enabled: Boolean(projectId),
    staleTime: 10_000,
    retry: 1,
  });
}

export function useSaveProjectFromWizard() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: SaveProjectFromWizardPayload) =>
      apiClient.saveProjectFromWizard(payload),
    onSuccess: async (savedProject) => {
      queryClient.setQueryData<Project[]>(['api', 'projects'], (current = []) => {
        const nextProjects = [savedProject, ...current.filter((project) => project.project_id !== savedProject.project_id)];
        return nextProjects;
      });
      await queryClient.invalidateQueries({ queryKey: ['api', 'projects'] });
    },
  });
}

export function useUpdateProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: UpdateProjectPayload) => apiClient.updateProject(projectId, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['api', 'projects'] });
      await queryClient.invalidateQueries({ queryKey: ['api', 'projects', projectId] });
    },
  });
}

export function useDeleteProject(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.deleteProject(projectId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['api', 'projects'] });
      await queryClient.removeQueries({ queryKey: ['api', 'projects', projectId] });
    },
  });
}
