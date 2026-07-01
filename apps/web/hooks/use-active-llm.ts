'use client';

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';

import { llmSettingsClient } from '@/lib/api/llm-settings';
import type { LlmProviderId } from '@contracts/llm-settings.contract';

const ACTIVE_LLM_QUERY_KEY = ['llm-settings', 'active'] as const;

export function useActiveLlm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ACTIVE_LLM_QUERY_KEY,
    queryFn: llmSettingsClient.active,
    staleTime: 30_000,
  });
  const confirmation = useMutation({
    mutationFn: ({
      capability,
      mode,
      override,
    }: {
      capability: string;
      mode?: 'llm' | 'deterministic';
      override?: LlmProviderId;
    }) => llmSettingsClient.confirm(capability, mode, override),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ACTIVE_LLM_QUERY_KEY }),
  });

  const confirmUse = useCallback(
    (capability: string, mode: 'llm' | 'deterministic' = 'llm', override?: LlmProviderId) =>
      confirmation.mutateAsync({ capability, mode, override }),
    [confirmation],
  );
  const openProviderSettings = useCallback(
    (provider?: LlmProviderId) =>
      router.push(provider ? `/settings?tab=ai&provider=${provider}` : '/settings?tab=ai'),
    [router],
  );
  const revalidate = useCallback(() => query.refetch(), [query]);

  const status = query.data?.status;

  return {
    ...query.data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    isReady: status === 'ready' && query.data?.mode === 'llm',
    isFailed: status === 'invalid' || status === 'expired' || status === 'unavailable',
    isNotConfigured: status === 'not_configured' || !query.data?.hasKey,
    requiresConfirmation: query.data?.requiresConfirmation ?? true,
    confirmUse,
    openProviderSettings,
    revalidate,
    isConfirming: confirmation.isPending,
  };
}

/** Canonical provider list for the "not configured" quick-config buttons. */
export const LLM_PROVIDER_OPTIONS: ReadonlyArray<{ id: LlmProviderId; label: string }> = [
  { id: 'anthropic', label: 'Claude' },
  { id: 'openai', label: 'GPT / OpenAI' },
  { id: 'google', label: 'Gemini' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'ollama', label: 'Ollama (local)' },
];
