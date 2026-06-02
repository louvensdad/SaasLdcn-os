export type NotificationTone = 'success' | 'warning' | 'error' | 'info';

export interface FoundationNotification {
  readonly id: string;
  readonly tone: NotificationTone;
  readonly title: string;
  readonly description: string;
  readonly timestamp: string;
  readonly unread: boolean;
}

export const FOUNDATION_NOTIFICATIONS: readonly FoundationNotification[] = [
  {
    id: 'foundation-ready',
    tone: 'success',
    title: 'Frontend foundation ready',
    description: 'Shell, themes, navigation, search, and UX systems are available.',
    timestamp: 'Now',
    unread: true,
  },
  {
    id: 'quality-gates',
    tone: 'info',
    title: 'Quality gates active',
    description: 'Build, typecheck, responsive, accessibility, and runtime checks remain required.',
    timestamp: 'Foundation',
    unread: true,
  },
  {
    id: 'backend-pending',
    tone: 'warning',
    title: 'Backend intentionally pending',
    description: 'No API, AI, agents, voice, avatar, or generation has been connected yet.',
    timestamp: 'Planned',
    unread: false,
  },
] as const;
