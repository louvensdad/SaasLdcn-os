import { create } from 'zustand';

import type { NotificationTone } from '@/lib/notifications';

export type ToastTone = NotificationTone;
export type ModalKind = 'confirmation' | 'information' | 'destructive';
export type DrawerKind = 'details' | 'project' | 'template';

export interface ToastAction {
  readonly label: string;
  readonly onSelect: () => void;
}

export interface ToastMessage {
  readonly id: string;
  readonly tone: ToastTone;
  readonly title: string;
  readonly description?: string;
  readonly action?: ToastAction;
}

interface UiState {
  readonly toasts: readonly ToastMessage[];
  readonly notificationCenterOpen: boolean;
  readonly modalOpen: boolean;
  readonly modalKind: ModalKind;
  readonly drawerOpen: boolean;
  readonly drawerKind: DrawerKind;
  addToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: (id: string) => void;
  openNotificationCenter: () => void;
  closeNotificationCenter: () => void;
  toggleNotificationCenter: () => void;
  openModal: (kind: ModalKind) => void;
  closeModal: () => void;
  openDrawer: (kind?: DrawerKind) => void;
  closeDrawer: () => void;
}

function createToastId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Real notification data (GenerationJob lifecycle) now lives in React Query
// via useNotifications() (apps/web/hooks/use-notifications.ts) -- this store
// only keeps the pure open/close UI state for the notification center panel.
export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  notificationCenterOpen: false,
  modalOpen: false,
  modalKind: 'information',
  drawerOpen: false,
  drawerKind: 'details',
  addToast: (toast) =>
    set((state) => ({
      toasts: [
        ...state.toasts.slice(-3),
        {
          ...toast,
          id: createToastId(),
        },
      ],
    })),
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
  openNotificationCenter: () => set({ notificationCenterOpen: true }),
  closeNotificationCenter: () => set({ notificationCenterOpen: false }),
  toggleNotificationCenter: () =>
    set((state) => ({ notificationCenterOpen: !state.notificationCenterOpen })),
  openModal: (modalKind) => set({ modalKind, modalOpen: true }),
  closeModal: () => set({ modalOpen: false }),
  openDrawer: (drawerKind = 'details') => set({ drawerKind, drawerOpen: true }),
  closeDrawer: () => set({ drawerOpen: false }),
}));
