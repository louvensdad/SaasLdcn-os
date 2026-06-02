'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { ArchitecturalGraph, ArchitecturalGraphPayload } from '@/lib/api/types';

export function useArchitecturalGraph(payload: ArchitecturalGraphPayload | null) {
  return useQuery<ArchitecturalGraph>({
    queryKey: ['api', 'architectural-graph', payload],
    queryFn: () => apiClient.getArchitecturalGraphPreview(payload!),
    enabled: Boolean(payload),
    staleTime: 30_000,
    retry: 1,
  });
}
