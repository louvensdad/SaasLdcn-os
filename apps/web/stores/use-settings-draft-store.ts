import { create } from 'zustand';

interface SettingsDraftState {
  /** fieldKey -> dirty. A Record (not a single boolean) so the save-bar's
   * count genuinely aggregates across however many draft-style preference
   * fields exist -- today just Interface's density, but it grows without a
   * redesign if more are added later. */
  readonly drafts: Record<string, boolean>;
  setDirty: (key: string, dirty: boolean) => void;
  clearAll: () => void;
}

export const useSettingsDraftStore = create<SettingsDraftState>((set) => ({
  drafts: {},
  setDirty: (key, dirty) =>
    set((state) => {
      if (!dirty && !(key in state.drafts)) return state;
      const next = { ...state.drafts };
      if (dirty) next[key] = true;
      else delete next[key];
      return { drafts: next };
    }),
  clearAll: () => set({ drafts: {} }),
}));

export function useUnsavedSettingsCount(): number {
  return useSettingsDraftStore((state) => Object.keys(state.drafts).length);
}
