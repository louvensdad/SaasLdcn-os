'use client';

import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { DeliveryEstimate, EngineeringReadinessPayload } from '@/lib/api/types';

export function useDeliveryEstimate(payload: EngineeringReadinessPayload | null) {
  const query = useQuery<DeliveryEstimate>({
    queryKey: ['api', 'engineering', payload, 'delivery-estimate'],
    queryFn: () =>
      apiClient.getEngineeringDeliveryEstimate(
        payload ?? {
          language_id: '',
          framework_id: '',
          architecture_id: '',
          capability_ids: [],
          infrastructure_ids: [],
        },
      ),
    enabled: Boolean(payload),
    staleTime: 30_000,
    retry: 1,
  });

  return {
    ...query,
    isEmpty: Boolean(payload) && !query.isLoading && !query.isError && query.data == null,
  };
}
