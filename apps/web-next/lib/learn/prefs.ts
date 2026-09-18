'use client';

import type { UserPreferencesBlob } from '@contracts/user-preferences.contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/api';

/**
 * What Learn remembers: whether the first steps are hidden and which guides were read. It lives in the interface
 * preference blob under `learn` (the backend has no learning category). Progress itself is never stored.
 */
export interface LearnPrefs {
  readonly firstSteps: 'visible' | 'hidden';
  readonly readGuides: readonly string[];
}

const KEY = ['preferences', 'interface'] as const;

function parse(blob: UserPreferencesBlob | undefined): LearnPrefs {
  const learn = (blob?.data?.learn ?? {}) as Record<string, unknown>;
  return {
    firstSteps: learn.first_steps === 'hidden' ? 'hidden' : 'visible',
    readGuides: Array.isArray(learn.read_guides) ? learn.read_guides.filter((id): id is string => typeof id === 'string') : [],
  };
}

export function useLearnPrefs() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: KEY, queryFn: api.interfacePreferences });
  const mutation = useMutation({
    mutationFn: async (patch: { readonly first_steps?: 'visible' | 'hidden'; readonly read_guides?: readonly string[] }) => {
      // Read, merge, write: the same blob holds other interface settings, and the current app rewrites it whole.
      const fresh = await api.interfacePreferences();
      const data = { ...(fresh.data ?? {}) };
      const learn = { ...((data.learn as Record<string, unknown> | undefined) ?? {}), ...patch };
      return api.saveInterfacePreferences({ ...data, learn });
    },
    onSuccess: (blob) => client.setQueryData(KEY, blob),
  });

  const prefs = parse(query.data);
  return {
    prefs,
    saving: mutation.isPending,
    saveFailed: mutation.isError,
    setFirstSteps: (value: 'visible' | 'hidden') => mutation.mutate({ first_steps: value }),
    markRead: (guideId: string) => mutation.mutate({ read_guides: Array.from(new Set([...prefs.readGuides, guideId])) }),
  };
}
