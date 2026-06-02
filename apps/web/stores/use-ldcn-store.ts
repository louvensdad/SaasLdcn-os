import { create } from 'zustand';

import type {
  LdcnAction,
  LdcnContext,
  LdcnPipelineAwareness,
  LdcnPresenceState,
  LdcnSuggestion,
  LdcnAvatarState,
  LdcnVoiceState,
} from '@contracts/ldcn.contract';

const DEFAULT_PIPELINE: LdcnPipelineAwareness = {
  route: '/dashboard',
  phase: 'Command center',
  status: 'previewing',
  readiness_label: 'Observing runtime surfaces',
};

const DEFAULT_CONTEXT: LdcnContext = {
  route: '/dashboard',
  page_title: 'Engineering Runtime Command Center',
  current_phase: 'Command center',
  pipeline: DEFAULT_PIPELINE,
  status: 'observing',
  summary: 'Reserved presence layer watching the engineering shell without executing generation or voice.',
  suggestions: [],
};

const DEFAULT_VOICE_STATE: LdcnVoiceState = {
  enabled: false,
  status: 'reserved',
};

const DEFAULT_AVATAR_STATE: LdcnAvatarState = {
  enabled: false,
  status: 'reserved',
};

interface LdcnState {
  readonly presenceState: LdcnPresenceState;
  readonly context: LdcnContext;
  readonly suggestions: readonly LdcnSuggestion[];
  readonly voiceState: LdcnVoiceState;
  readonly avatarState: LdcnAvatarState;
  setPresenceState: (presenceState: LdcnPresenceState) => void;
  setContext: (context: LdcnContext) => void;
  setSuggestions: (suggestions: readonly LdcnSuggestion[]) => void;
  setVoiceState: (voiceState: LdcnVoiceState) => void;
  setAvatarState: (avatarState: LdcnAvatarState) => void;
  setActionReservations: (actions: readonly LdcnAction[]) => void;
  reset: () => void;
}

export const useLDCNStore = create<LdcnState>((set) => ({
  presenceState: DEFAULT_CONTEXT.status,
  context: DEFAULT_CONTEXT,
  suggestions: [],
  voiceState: DEFAULT_VOICE_STATE,
  avatarState: DEFAULT_AVATAR_STATE,
  setPresenceState: (presenceState) => set((state) => ({ presenceState, context: { ...state.context, status: presenceState } })),
  setContext: (context) => set({ context, presenceState: context.status }),
  setSuggestions: (suggestions) => set({ suggestions }),
  setVoiceState: (voiceState) => set({ voiceState }),
  setAvatarState: (avatarState) => set({ avatarState }),
  setActionReservations: (actions) =>
    set((state) => ({
      context: {
        ...state.context,
        suggestions: actions.map((action, index) => ({
          id: `reserved-${index}-${action}`,
          action,
          label: action,
          summary: 'Reserved future action for the LDCN presence layer.',
          reserved: true,
        })),
      },
    })),
  reset: () =>
    set({
      presenceState: DEFAULT_CONTEXT.status,
      context: DEFAULT_CONTEXT,
      suggestions: [],
      voiceState: DEFAULT_VOICE_STATE,
      avatarState: DEFAULT_AVATAR_STATE,
    }),
}));
