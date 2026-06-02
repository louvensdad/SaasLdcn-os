'use client';

import { useMutation, useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type {
  SkillCatalogResponse,
  SkillDefinition,
  SkillPreview,
  SkillPreviewRequest,
  SkillRecommendation,
  ValidateSelectionPayload,
} from '@/lib/api/types';

export function useSkills() {
  return useQuery<SkillCatalogResponse>({
    queryKey: ['api', 'skills'],
    queryFn: () => apiClient.getSkills(),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useSkillDetail(skillId: string | null) {
  return useQuery<SkillDefinition>({
    queryKey: ['api', 'skills', 'detail', skillId],
    queryFn: () => apiClient.getSkill(skillId ?? ''),
    enabled: Boolean(skillId),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useSkillCategories() {
  return useQuery<string[]>({
    queryKey: ['api', 'skills', 'categories'],
    queryFn: () => apiClient.getSkillCategories(),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useRecommendedSkills(
  selection: (Partial<ValidateSelectionPayload> & { readonly project_id?: string | null; readonly has_generated_project?: boolean }) | null,
) {
  return useQuery<SkillRecommendation[]>({
    queryKey: ['api', 'skills', 'recommended', selection],
    queryFn: () => apiClient.getRecommendedSkills(selection ?? {}),
    enabled: Boolean(selection),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useSkillPreview() {
  return useMutation<SkillPreview, Error, SkillPreviewRequest>({
    mutationFn: (payload) => apiClient.previewSkill(payload),
  });
}
