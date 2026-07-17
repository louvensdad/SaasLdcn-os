import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AdvancedSettingsState {
  readonly devMode: boolean;
  setDevMode: (devMode: boolean) => void;
  importAll: (snapshot: Partial<Pick<AdvancedSettingsState, 'devMode'>>) => void;
}

/** Just devMode today -- kept separate from useShellStore (theme/density,
 * genuinely shell-level concerns) since this is Advanced-tab-specific and
 * likely to grow with its own unrelated fields later. */
export const useAdvancedSettingsStore = create<AdvancedSettingsState>()(
  persist(
    (set) => ({
      devMode: false,
      setDevMode: (devMode) => set({ devMode }),
      importAll: (snapshot) => set(snapshot),
    }),
    { name: 'ldcn-advanced-settings-v1' },
  ),
);
