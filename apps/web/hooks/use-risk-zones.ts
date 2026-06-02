'use client';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import type { RiskZone, SystemDesignVisualizationPayload } from '@/lib/api/types';
export function useRiskZones(payload: SystemDesignVisualizationPayload | null) {
  return useQuery<RiskZone[]>({ queryKey: ['api', 'system-design', payload, 'risks'], queryFn: () => apiClient.getRiskZones(payload!), enabled: Boolean(payload), staleTime: 30_000, retry: 1 });
}
