import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AccentId = 'violet' | 'blue' | 'cyan' | 'emerald' | 'lime' | 'amber' | 'orange' | 'rose' | 'pink' | 'slate';
export type FontFamilyId = 'inter' | 'system' | 'mono' | 'serif';
export type FontSizeId = 'small' | 'medium' | 'large';

export interface AccentDef {
  readonly id: AccentId;
  readonly accent: string;
  readonly accent2: string;
}

// Real, applied accent palette -- these values are written onto --accent /
// --accent-2 (and the derived gradient) on the document root, so switching one
// re-tints the whole product live.
export const ACCENTS: readonly AccentDef[] = [
  { id: 'violet', accent: '#8b5cf6', accent2: '#22b8c7' },
  { id: 'blue', accent: '#3b82f6', accent2: '#22d3ee' },
  { id: 'cyan', accent: '#06b6d4', accent2: '#6366f1' },
  { id: 'emerald', accent: '#10b981', accent2: '#22d3ee' },
  { id: 'lime', accent: '#84cc16', accent2: '#10b981' },
  { id: 'amber', accent: '#f59e0b', accent2: '#f97316' },
  { id: 'orange', accent: '#f97316', accent2: '#ef4444' },
  { id: 'rose', accent: '#f43f5e', accent2: '#ec4899' },
  { id: 'pink', accent: '#ec4899', accent2: '#a855f7' },
  { id: 'slate', accent: '#64748b', accent2: '#94a3b8' },
];

export const FONT_STACKS: Record<FontFamilyId, string> = {
  inter: '"Inter", "SF Pro Display", "Segoe UI", system-ui, sans-serif',
  system: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  mono: '"JetBrains Mono", "IBM Plex Mono", Consolas, monospace',
  serif: 'Georgia, "Times New Roman", serif',
};

export const FONT_SCALES: Record<FontSizeId, number> = { small: 0.9375, medium: 1, large: 1.0625 };

export interface InterfacePreferencesSnapshot {
  readonly accent: AccentId;
  readonly fontFamily: FontFamilyId;
  readonly fontSize: FontSizeId;
  readonly radius: number;
  readonly animations: boolean;
  readonly reduceMotion: boolean;
  readonly showBreadcrumbs: boolean;
  readonly sidebarCollapsedDefault: boolean;
  readonly showHelpTips: boolean;
  readonly focusMode: boolean;
  // Opt-in only: this stores the user's *preference*, not the real OS-level
  // Notification.permission grant (that's read live -- see
  // use-browser-notification-permission.ts). Both must agree before a native
  // notification is ever shown.
  readonly browserNotificationsEnabled: boolean;
}

interface InterfacePreferencesState extends InterfacePreferencesSnapshot {
  setAccent: (accent: AccentId) => void;
  setFontFamily: (fontFamily: FontFamilyId) => void;
  setFontSize: (fontSize: FontSizeId) => void;
  setRadius: (radius: number) => void;
  setAnimations: (value: boolean) => void;
  setReduceMotion: (value: boolean) => void;
  setShowBreadcrumbs: (value: boolean) => void;
  setSidebarCollapsedDefault: (value: boolean) => void;
  setShowHelpTips: (value: boolean) => void;
  setFocusMode: (value: boolean) => void;
  setBrowserNotificationsEnabled: (value: boolean) => void;
  importAll: (snapshot: Partial<InterfacePreferencesSnapshot>) => void;
}

export function interfacePreferencesSnapshot(state: InterfacePreferencesState): InterfacePreferencesSnapshot {
  const {
    accent, fontFamily, fontSize, radius, animations, reduceMotion,
    showBreadcrumbs, sidebarCollapsedDefault, showHelpTips, focusMode, browserNotificationsEnabled,
  } = state;
  return {
    accent, fontFamily, fontSize, radius, animations, reduceMotion,
    showBreadcrumbs, sidebarCollapsedDefault, showHelpTips, focusMode, browserNotificationsEnabled,
  };
}

export const useInterfacePreferencesStore = create<InterfacePreferencesState>()(
  persist(
    (set) => ({
      accent: 'violet',
      fontFamily: 'inter',
      fontSize: 'medium',
      radius: 12,
      animations: true,
      reduceMotion: false,
      showBreadcrumbs: true,
      sidebarCollapsedDefault: false,
      showHelpTips: true,
      focusMode: false,
      browserNotificationsEnabled: false,
      setAccent: (accent) => set({ accent }),
      setFontFamily: (fontFamily) => set({ fontFamily }),
      setFontSize: (fontSize) => set({ fontSize }),
      setRadius: (radius) => set({ radius }),
      setAnimations: (animations) => set({ animations }),
      setReduceMotion: (reduceMotion) => set({ reduceMotion }),
      setShowBreadcrumbs: (showBreadcrumbs) => set({ showBreadcrumbs }),
      setSidebarCollapsedDefault: (sidebarCollapsedDefault) => set({ sidebarCollapsedDefault }),
      setShowHelpTips: (showHelpTips) => set({ showHelpTips }),
      setFocusMode: (focusMode) => set({ focusMode }),
      setBrowserNotificationsEnabled: (browserNotificationsEnabled) => set({ browserNotificationsEnabled }),
      importAll: (snapshot) => set((state) => ({ ...state, ...snapshot })),
    }),
    { name: 'ldcn-interface-preferences-v1' },
  ),
);
