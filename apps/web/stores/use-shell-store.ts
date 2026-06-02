import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_THEME_ID, type ThemeId } from '@/lib/themes';

interface ShellState {
  readonly themeId: ThemeId;
  readonly sidebarOpen: boolean;
  readonly hydrated: boolean;
  setThemeId: (themeId: ThemeId) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setHydrated: (hydrated: boolean) => void;
}

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      themeId: DEFAULT_THEME_ID,
      sidebarOpen: false,
      hydrated: false,
      setThemeId: (themeId) => set({ themeId }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: 'ldcn-shell-v2',
      partialize: (state) => ({ themeId: state.themeId }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
