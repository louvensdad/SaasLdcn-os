'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { DeploymentTopology, SystemDesignVisualizationPayload } from '@/lib/api/types';
export function useDeploymentTopology(payload: SystemDesignVisualizationPayload | null) {
  return useQuery<DeploymentTopology>({ queryKey: ['api', 'system-design', payload, 'deployment'], queryFn: () => apiClient.getDeploymentTopology(payload!), enabled: Boolean(payload), staleTime: 30_000, retry: 1 });
}
