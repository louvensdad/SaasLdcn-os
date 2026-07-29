'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';
import type { RepositoryCreateRequest } from '@/lib/api/types';

export function useGitProviderConnection(
  provider: 'github' | 'gitlab',
  enabled = true,
) {
  return useQuery({
    queryKey: ['git-provider', provider],
    queryFn: () => apiClient.getGitProviderConnection(provider),
    enabled,
  });
}

export function useConnectGitProvider(provider: 'github' | 'gitlab') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ token, ttlSeconds }: { token: string; ttlSeconds?: number | null }) =>
      apiClient.connectGitProvider(provider, token, ttlSeconds),
    onSuccess: (connection) => queryClient.setQueryData(['git-provider', provider], connection),
  });
}

export function useValidateGitProvider(provider: 'github' | 'gitlab') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.validateGitProvider(provider),
    onSuccess: (connection) => queryClient.setQueryData(['git-provider', provider], connection),
  });
}

export function useDisconnectGitProvider(provider: 'github' | 'gitlab') {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.disconnectGitProvider(provider),
    onSuccess: (connection) => queryClient.setQueryData(['git-provider', provider], connection),
  });
}

export function useCreateRepository() {
  return useMutation({
    mutationFn: (payload: RepositoryCreateRequest) => apiClient.createRepository(payload),
  });
}
