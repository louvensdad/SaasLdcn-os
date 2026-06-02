'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { InfrastructureTopology, SystemDesignVisualizationPayload } from '@/lib/api/types';
export function useInfrastructureTopology(payload: SystemDesignVisualizationPayload | null) {
  return useQuery<InfrastructureTopology>({ queryKey: ['api', 'system-design', payload, 'infrastructure'], queryFn: () => apiClient.getInfrastructureTopology(payload!), enabled: Boolean(payload), staleTime: 30_000, retry: 1 });
}
