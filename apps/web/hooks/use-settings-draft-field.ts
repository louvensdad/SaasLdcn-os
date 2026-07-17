'use client';

import { useEffect, useState } from 'react';

/** Tracks one preference field as a local draft against its committed
 * (persisted) value -- e.g. Interface's density, previewed live before the
 * header's "Salvar alterações" button commits it. Scoped to new
 * preference-style fields only -- existing working mutations (AI keys, Git
 * connections, account deletion) keep their own immediate action buttons,
 * not this. */
export function useSettingsDraftField<T>(key: string, committed: T, commit: (value: T) => void) {
  const [draft, setDraftState] = useState<T>(committed);

  useEffect(() => {
    setDraftState(committed);
  }, [committed, key]);

  return {
    draft,
    setDraft: setDraftState,
    isDirty: draft !== committed,
    save: () => commit(draft),
    discard: () => setDraftState(committed),
  };
}
