import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_THEME_ID, type ThemeId } from '@/lib/themes';

export type InterfaceDensity = 'comfortable' | 'compact';

interface ShellState {
  readonly themeId: ThemeId;
  readonly sidebarOpen: boolean;
  readonly hydrated: boolean;
  readonly density: InterfaceDensity;
  setThemeId: (themeId: ThemeId) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setHydrated: (hydrated: boolean) => void;
  setDensity: (density: InterfaceDensity) => void;
}

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      themeId: DEFAULT_THEME_ID,
      sidebarOpen: false,
      hydrated: false,
      density: 'comfortable',
      setThemeId: (themeId) => set({ themeId }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setHydrated: (hydrated) => set({ hydrated }),
      setDensity: (density) => set({ density }),
    }),
    {
      name: 'ldcn-shell-v4',
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as Partial<ShellState> | undefined;
        const density: InterfaceDensity = state?.density === 'compact' ? 'compact' : 'comfortable';
        return {
          ...state,
          themeId: state?.themeId === 'light' ? 'light' : DEFAULT_THEME_ID,
          density,
        };
      },
      partialize: (state) => ({ themeId: state.themeId, density: state.density }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
