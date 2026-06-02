import { create } from 'zustand';

import {
  FOUNDATION_NOTIFICATIONS,
  type FoundationNotification,
  type NotificationTone,
} from '@/lib/notifications';

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
  readonly notifications: readonly FoundationNotification[];
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
  markNotificationsRead: () => void;
}

function createToastId() {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  notifications: FOUNDATION_NOTIFICATIONS,
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
  markNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((notification) => ({
        ...notification,
        unread: false,
      })),
    })),
}));
