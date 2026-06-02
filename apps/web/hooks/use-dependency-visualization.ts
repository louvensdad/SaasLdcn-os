'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { DependencyVisualization, SystemDesignVisualizationPayload } from '@/lib/api/types';
export function useDependencyVisualization(payload: SystemDesignVisualizationPayload | null) {
  return useQuery<DependencyVisualization>({ queryKey: ['api', 'system-design', payload, 'dependency'], queryFn: () => apiClient.getDependencyVisualization(payload!), enabled: Boolean(payload), staleTime: 30_000, retry: 1 });
}
