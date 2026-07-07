'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { metaFactoryClient } from '@/lib/api/meta-factory';
import type { GenerationJobSummary } from '@contracts/generation-job.contract';

const JOBS_QUERY_KEY = ['meta-factory', 'jobs'] as const;

/** The jobs "space": every generation the user has run. `archived` filters to
 * the active list (false), the archive (true), or everything (undefined). */
export function useGenerationJobs(archived?: boolean) {
  return useQuery<GenerationJobSummary[]>({
    queryKey: [...JOBS_QUERY_KEY, archived ?? 'all'],
    queryFn: () => metaFactoryClient.listJobs(archived),
    staleTime: 15_000,
    retry: 1,
  });
}

export function useSetJobArchived() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ jobId, archived }: { jobId: string; archived: boolean }) =>
      metaFactoryClient.setJobArchived(jobId, archived),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY }),
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => metaFactoryClient.deleteJob(jobId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: JOBS_QUERY_KEY }),
  });
}
