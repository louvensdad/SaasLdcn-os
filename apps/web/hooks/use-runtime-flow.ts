'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { RuntimeFlow, SystemDesignVisualizationPayload } from '@/lib/api/types';
export function useRuntimeFlow(payload: SystemDesignVisualizationPayload | null) {
  return useQuery<RuntimeFlow>({ queryKey: ['api', 'system-design', payload, 'runtime'], queryFn: () => apiClient.getRuntimeFlow(payload!), enabled: Boolean(payload), staleTime: 30_000, retry: 1 });
}
