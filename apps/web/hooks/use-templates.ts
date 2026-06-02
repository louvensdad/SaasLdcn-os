'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type {
  Template,
  TemplateCatalogResponse,
  TemplateCompatibilityResponse,
  TemplateMarketplaceItem,
  TemplateRecommendationResponse,
  ValidateSelectionPayload,
} from '@/lib/api/types';

export function useTemplates() {
  return useQuery<Template[]>({
    queryKey: ['api', 'templates'],
    queryFn: () => apiClient.getTemplates(),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useTemplateCatalog() {
  return useQuery<TemplateCatalogResponse>({
    queryKey: ['api', 'templates', 'catalog'],
    queryFn: () => apiClient.getTemplateCatalog(),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useTemplateCategories() {
  return useQuery<string[]>({
    queryKey: ['api', 'templates', 'categories'],
    queryFn: () => apiClient.getTemplateCategories(),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useTemplateDetail(templateId: string | null) {
  return useQuery<TemplateMarketplaceItem>({
    queryKey: ['api', 'templates', 'detail', templateId],
    queryFn: () => apiClient.getTemplate(templateId ?? ''),
    enabled: Boolean(templateId),
    staleTime: 60_000,
    retry: 1,
  });
}

export function useTemplateCompatibility(templateId: string | null, selection: Partial<ValidateSelectionPayload> | null) {
  return useQuery<TemplateCompatibilityResponse>({
    queryKey: ['api', 'templates', 'compatibility', templateId, selection],
    queryFn: () => apiClient.getTemplateCompatibility(templateId ?? '', selection ?? {}),
    enabled: Boolean(templateId && selection),
    staleTime: 30_000,
    retry: 1,
  });
}

export function useRecommendedTemplates(selection: Partial<ValidateSelectionPayload> | null) {
  return useQuery<TemplateRecommendationResponse>({
    queryKey: ['api', 'templates', 'recommended', selection],
    queryFn: () => apiClient.getRecommendedTemplates(selection ?? {}),
    enabled: Boolean(selection),
    staleTime: 30_000,
    retry: 1,
  });
}
