import type { LucideIcon } from 'lucide-react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { DEFAULT_THEME_ID, type ThemeId } from '@/lib/themes';

export type InterfaceDensity = 'comfortable' | 'compact';

/** A page-provided override for the shared Topbar -- e.g. a breadcrumb and a
 * primary action -- without duplicating the search/notifications/locale/theme
 * controls Topbar already renders on every route. Set via a page effect (same
 * "page announces its own context to the shell" shape useLDCNStore's
 * setContext already uses) and cleared on unmount so leaving the page reverts
 * Topbar to its default per-route title/subtitle. Never persisted. */
export interface TopbarConfig {
  readonly breadcrumb?: readonly string[];
  readonly title?: string;
  readonly subtitle?: string;
  readonly primaryAction?: {
    readonly label: string;
    readonly icon?: LucideIcon;
    readonly onClick: () => void;
    readonly loading?: boolean;
  };
  readonly secondaryText?: string;
}

interface ShellState {
  readonly themeId: ThemeId;
  readonly sidebarOpen: boolean;
  readonly hydrated: boolean;
  readonly density: InterfaceDensity;
  readonly topbarConfig: TopbarConfig | null;
  setThemeId: (themeId: ThemeId) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  setHydrated: (hydrated: boolean) => void;
  setDensity: (density: InterfaceDensity) => void;
  setTopbarConfig: (config: TopbarConfig | null) => void;
}

export const useShellStore = create<ShellState>()(
  persist(
    (set) => ({
      themeId: DEFAULT_THEME_ID,
      sidebarOpen: false,
      hydrated: false,
      density: 'comfortable',
      topbarConfig: null,
      setThemeId: (themeId) => set({ themeId }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setHydrated: (hydrated) => set({ hydrated }),
      setDensity: (density) => set({ density }),
      setTopbarConfig: (topbarConfig) => set({ topbarConfig }),
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
      // topbarConfig is transient (page-lifetime only) -- never persisted.
      partialize: (state) => ({ themeId: state.themeId, density: state.density }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    },
  ),
);
