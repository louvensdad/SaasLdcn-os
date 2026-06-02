'use client';

import { useQueries } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type {
  FrameworkArchitectureGuidance,
  FrameworkCapabilityGuidance,
  FrameworkEndpointGuidance,
} from '@/lib/api/types';

export function useFrameworkRecommendations(frameworkId: string | null) {
  const queries = useQueries({
    queries: [
      {
        queryKey: ['api', 'framework-specialists', frameworkId, 'architectures'],
        queryFn: () => apiClient.getFrameworkRecommendedArchitectures(frameworkId ?? ''),
        enabled: Boolean(frameworkId),
        staleTime: 60_000,
        retry: 1,
      },
      {
        queryKey: ['api', 'framework-specialists', frameworkId, 'capabilities'],
        queryFn: () => apiClient.getFrameworkRecommendedCapabilities(frameworkId ?? ''),
        enabled: Boolean(frameworkId),
        staleTime: 60_000,
        retry: 1,
      },
      {
        queryKey: ['api', 'framework-specialists', frameworkId, 'endpoints'],
        queryFn: () => apiClient.getFrameworkRecommendedEndpoints(frameworkId ?? ''),
        enabled: Boolean(frameworkId),
        staleTime: 60_000,
        retry: 1,
      },
    ],
  });

  const [architecturesQuery, capabilitiesQuery, endpointsQuery] = queries;
  const architectures = architecturesQuery.data ?? [];
  const capabilities = capabilitiesQuery.data ?? [];
  const endpoints = endpointsQuery.data ?? [];

  return {
    architectures: architectures as FrameworkArchitectureGuidance[],
    capabilities: capabilities as FrameworkCapabilityGuidance[],
    endpoints: endpoints as FrameworkEndpointGuidance[],
    isLoading: queries.some((query) => query.isLoading),
    isError: queries.some((query) => query.isError),
    error: queries.find((query) => query.error)?.error ?? null,
    isEmpty:
      Boolean(frameworkId) &&
      !queries.some((query) => query.isLoading || query.isError) &&
      architectures.length === 0 &&
      capabilities.length === 0 &&
      endpoints.length === 0,
  };
}
