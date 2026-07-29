'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { metaFactoryClient } from '@/lib/api/meta-factory';
import type { DeliveryDecision, DeliveryMode } from '@contracts/delivery.contract';

const DELIVERY_QUERY_KEY = (projectId: string) => ['meta-factory', 'delivery', projectId] as const;

/** Delivery Decision Center: generation finishing and how the user wants the
 * output delivered are independent decisions -- this never gates the
 * existing ZIP/Git export actions, it only recommends and records a choice. */
export function useDeliveryDecision(projectId: string | null) {
  return useQuery<DeliveryDecision>({
    queryKey: DELIVERY_QUERY_KEY(projectId ?? ''),
    queryFn: () => metaFactoryClient.getDeliveryDecision(projectId ?? ''),
    enabled: Boolean(projectId),
    staleTime: 15_000,
    retry: 1,
  });
}

export function useRecordDeliveryDecision(projectId: string | null) {
  const queryClient = useQueryClient();
  return useMutation<DeliveryDecision, Error, DeliveryMode>({
    mutationFn: (deliveryMode) => metaFactoryClient.recordDeliveryDecision(projectId ?? '', deliveryMode),
    onSuccess: (data) => {
      queryClient.setQueryData(DELIVERY_QUERY_KEY(projectId ?? ''), data);
    },
  });
}
