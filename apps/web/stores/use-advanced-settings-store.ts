import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AdvancedSettingsState {
  readonly devMode: boolean;
  setDevMode: (devMode: boolean) => void;
}

/** Just devMode today -- kept separate from useShellStore (theme/density,
 * genuinely shell-level concerns) since this is Advanced-tab-specific and
 * likely to grow with its own unrelated fields later. */
export const useAdvancedSettingsStore = create<AdvancedSettingsState>()(
  persist(
    (set) => ({
      devMode: false,
      setDevMode: (devMode) => set({ devMode }),
    }),
    { name: 'ldcn-advanced-settings-v1' },
  ),
);
