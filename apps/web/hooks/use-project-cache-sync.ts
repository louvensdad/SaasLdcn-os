'use client';

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { PROJECT_LIFECYCLE_KEYS } from '@/lib/api/query-keys';

/**
 * Bridge between the Project Room lifecycle world (Architect, Engineering
 * Review, Meta-Factory, Modernize, the Room page) — which manages its own
 * state with local `useState` + direct client calls — and the React Query
 * world used by every catalog/dashboard surface (`/projects`, `/dashboard`,
 * `/documentation`, `/roadmap`, downloads).
 *
 * Those lifecycle pages replace their own local state from each mutation
 * response, so they stay fresh internally. But they never touched the React
 * Query cache, so advancing a room (approve, blueprint, send-to-generator,
 * mark-generated, generation complete) left every React Query surface showing
 * stale status until a manual F5. Calling the returned `syncProjectCaches`
 * after any such mutation invalidates the project-coupled caches so they
 * refetch automatically.
 */
export function useProjectCacheSync() {
  const queryClient = useQueryClient();

  return useCallback(() => {
    for (const queryKey of PROJECT_LIFECYCLE_KEYS) {
      void queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient]);
}
