'use client';

import { useQuery } from '@tanstack/react-query';

import { apiRequest } from '@/lib/api/client';
import { apiEndpoints } from '@/lib/api/endpoints';
import type { SystemPresence } from '@contracts/system-presence.contract';

export function useSystemPresence(workspaceId?: string) {
  return useQuery<SystemPresence>({
    queryKey: ['system-presence', workspaceId ?? 'current'],
    queryFn: () => apiRequest<SystemPresence>(workspaceId ? `${apiEndpoints.systemPresence}?workspace_id=${encodeURIComponent(workspaceId)}` : apiEndpoints.systemPresence),
    refetchInterval: 15_000,
    staleTime: 10_000,
    retry: 2,
    refetchIntervalInBackground: false,
  });
}
