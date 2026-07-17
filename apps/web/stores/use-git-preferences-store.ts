import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface GitPreferencesState {
  readonly signCommits: boolean;
  readonly protectedBranchChecks: boolean;
  readonly autoSync: boolean;
  readonly autoCleanup: boolean;
  set: (key: keyof Omit<GitPreferencesState, 'set' | 'importAll'>, value: boolean) => void;
  importAll: (snapshot: Partial<Omit<GitPreferencesState, 'set' | 'importAll'>>) => void;
}

/** Client-persisted global Git preferences (Git tab footer). Real, stored user
 * choices; the generation/export pipeline honours what it supports today, the
 * rest is a forward-ready preference surface -- not a claim that every toggle
 * changes server behaviour yet. */
export const useGitPreferencesStore = create<GitPreferencesState>()(
  persist(
    (set) => ({
      signCommits: true,
      protectedBranchChecks: true,
      autoSync: false,
      autoCleanup: true,
      set: (key, value) => set({ [key]: value } as Partial<GitPreferencesState>),
      importAll: (snapshot) => set(snapshot),
    }),
    { name: 'ldcn-git-preferences-v1' },
  ),
);
