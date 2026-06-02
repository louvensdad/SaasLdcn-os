'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { RoadmapResponse } from '@/lib/api/types';

export function useRoadmap() {
  return useQuery<RoadmapResponse>({
    queryKey: ['api', 'roadmap'],
    queryFn: () => apiClient.getRoadmap(),
    staleTime: 60_000,
    retry: 1,
  });
}
