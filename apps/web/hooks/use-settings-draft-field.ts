'use client';

import { useEffect, useState } from 'react';

import { useSettingsDraftStore } from '@/stores/use-settings-draft-store';

/** Tracks one preference field as a local draft against its committed
 * (persisted) value, and registers/clears its dirty state on the shared
 * settings-draft store so SettingsSaveBar's count reflects it. Scoped to
 * new preference-style fields only (e.g. Interface's density) -- existing
 * working mutations (AI keys, Git connections, account deletion) keep their
 * own immediate action buttons, not this. */
export function useSettingsDraftField<T>(key: string, committed: T, commit: (value: T) => void) {
  const [draft, setDraftState] = useState<T>(committed);
  const setDirty = useSettingsDraftStore((state) => state.setDirty);

  useEffect(() => {
    setDraftState(committed);
  }, [committed]);

  const isDirty = draft !== committed;

  useEffect(() => {
    setDirty(key, isDirty);
    return () => setDirty(key, false);
  }, [key, isDirty, setDirty]);

  return {
    draft,
    setDraft: setDraftState,
    isDirty,
    save: () => commit(draft),
    discard: () => setDraftState(committed),
  };
}
