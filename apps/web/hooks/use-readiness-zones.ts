'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { ReadinessZone, SystemDesignVisualizationPayload } from '@/lib/api/types';
export function useReadinessZones(payload: SystemDesignVisualizationPayload | null) {
  return useQuery<ReadinessZone[]>({ queryKey: ['api', 'system-design', payload, 'readiness'], queryFn: () => apiClient.getReadinessZones(payload!), enabled: Boolean(payload), staleTime: 30_000, retry: 1 });
}
