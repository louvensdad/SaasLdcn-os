'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { ArchitectureTopology, SystemDesignVisualizationPayload } from '@/lib/api/types';
export function useArchitectureTopology(payload: SystemDesignVisualizationPayload | null) {
  return useQuery<ArchitectureTopology>({ queryKey: ['api', 'system-design', payload, 'architecture'], queryFn: () => apiClient.getArchitectureTopology(payload!), enabled: Boolean(payload), staleTime: 30_000, retry: 1 });
}
