'use client';

import { useMutation } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { GatekeeperPreviewPayload, GatekeeperReport } from '@/lib/api/types';

export function useGatekeeperPreview() {
  return useMutation<GatekeeperReport, Error, GatekeeperPreviewPayload>({
    mutationFn: (payload) => apiClient.previewGatekeeper(payload),
  });
}
