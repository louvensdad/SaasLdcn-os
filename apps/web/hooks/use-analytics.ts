'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';

import {
  getAnalyticsOverview,
  type AnalyticsFilters,
} from '@/lib/api/analytics';

export function useAnalytics(filters: AnalyticsFilters) {
  return useQuery({
    queryKey: ['api', 'analytics', 'overview', filters],
    queryFn: () => getAnalyticsOverview(filters),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: 1,
  });
}
