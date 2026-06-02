'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { SystemDesignVisualizationPayload, TeamTopology } from '@/lib/api/types';
export function useTeamTopology(payload: SystemDesignVisualizationPayload | null) {
  return useQuery<TeamTopology>({ queryKey: ['api', 'system-design', payload, 'team'], queryFn: () => apiClient.getTeamTopology(payload!), enabled: Boolean(payload), staleTime: 30_000, retry: 1 });
}
