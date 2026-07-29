import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type AiProfileId = 'fast' | 'balanced' | 'quality' | 'economic';

export interface AiSliderState {
  readonly creativity: number;
  readonly precision: number;
  readonly speed: number;
  readonly contextUsage: number;
  readonly memoryUsage: number;
}

export interface AiFlagState {
  readonly detailedExplanations: boolean;
  readonly devMode: boolean;
  readonly economicMode: boolean;
  readonly maxQuality: boolean;
  readonly autoReview: boolean;
}

export interface AiMemoryState {
  readonly shortTerm: boolean;
  readonly longTerm: boolean;
  readonly perProject: boolean;
  readonly continuousLearning: boolean;
}

export const AI_AGENT_IDS = [
  'architect', 'backend', 'frontend', 'mobile', 'qa',
  'security', 'devops', 'ux', 'database', 'documentation',
] as const;
export type AiAgentId = (typeof AI_AGENT_IDS)[number];

export interface AiSecurityState {
  readonly allowInternet: boolean;
  readonly sandbox: boolean;
  readonly detailedLogs: boolean;
  readonly doubleValidation: boolean;
  readonly tripleCheck: boolean;
}

export interface AiPreferencesState {
  readonly sliders: AiSliderState;
  readonly flags: AiFlagState;
  readonly memory: AiMemoryState;
  readonly agents: Record<AiAgentId, boolean>;
  readonly security: AiSecurityState;
  readonly profile: AiProfileId;
  setSlider: (key: keyof AiSliderState, value: number) => void;
  setFlag: (key: keyof AiFlagState, value: boolean) => void;
  setMemory: (key: keyof AiMemoryState, value: boolean) => void;
  setAgent: (agent: AiAgentId, value: boolean) => void;
  setSecurity: (key: keyof AiSecurityState, value: boolean) => void;
  setProfile: (profile: AiProfileId) => void;
  importAll: (snapshot: AiPreferencesSnapshot) => void;
}

export interface AiPreferencesSnapshot {
  readonly sliders: AiSliderState;
  readonly flags: AiFlagState;
  readonly memory: AiMemoryState;
  readonly agents: Record<AiAgentId, boolean>;
  readonly security: AiSecurityState;
  readonly profile: AiProfileId;
}

// Applying a profile snaps the tuning sliders/flags to that preset -- the same
// values are still individually adjustable afterwards.
export const PROFILE_PRESETS: Record<AiProfileId, { sliders: AiSliderState; economicMode: boolean; maxQuality: boolean }> = {
  fast: {
    sliders: { creativity: 50, precision: 70, speed: 95, contextUsage: 60, memoryUsage: 50 },
    economicMode: false, maxQuality: false,
  },
  balanced: {
    sliders: { creativity: 70, precision: 85, speed: 60, contextUsage: 90, memoryUsage: 75 },
    economicMode: false, maxQuality: true,
  },
  quality: {
    sliders: { creativity: 60, precision: 95, speed: 35, contextUsage: 100, memoryUsage: 90 },
    economicMode: false, maxQuality: true,
  },
  economic: {
    sliders: { creativity: 55, precision: 75, speed: 70, contextUsage: 50, memoryUsage: 40 },
    economicMode: true, maxQuality: false,
  },
};

/** Client-persisted AI tuning preferences (IA tab). These record genuine,
 * stored user choices; the generation pipeline consults what it supports
 * (profile/economic mode align with the backend's cost-ladder behaviour),
 * while the rest is a forward-ready preference surface -- not proof every
 * knob alters the pipeline today. */
export const useAiPreferencesStore = create<AiPreferencesState>()(
  persist(
    (set) => ({
      sliders: PROFILE_PRESETS.balanced.sliders,
      flags: { detailedExplanations: true, devMode: true, economicMode: false, maxQuality: true, autoReview: true },
      memory: { shortTerm: true, longTerm: true, perProject: true, continuousLearning: true },
      agents: Object.fromEntries(AI_AGENT_IDS.map((id) => [id, true])) as Record<AiAgentId, boolean>,
      security: { allowInternet: true, sandbox: true, detailedLogs: true, doubleValidation: true, tripleCheck: true },
      profile: 'balanced',
      setSlider: (key, value) => set((state) => ({ sliders: { ...state.sliders, [key]: value } })),
      setFlag: (key, value) => set((state) => ({ flags: { ...state.flags, [key]: value } })),
      setMemory: (key, value) => set((state) => ({ memory: { ...state.memory, [key]: value } })),
      setAgent: (agent, value) => set((state) => ({ agents: { ...state.agents, [agent]: value } })),
      setSecurity: (key, value) => set((state) => ({ security: { ...state.security, [key]: value } })),
      setProfile: (profile) =>
        set((state) => ({
          profile,
          sliders: PROFILE_PRESETS[profile].sliders,
          flags: {
            ...state.flags,
            economicMode: PROFILE_PRESETS[profile].economicMode,
            maxQuality: PROFILE_PRESETS[profile].maxQuality,
          },
        })),
      importAll: (snapshot) =>
        set({
          sliders: snapshot.sliders,
          flags: snapshot.flags,
          memory: snapshot.memory,
          agents: snapshot.agents,
          security: snapshot.security,
          profile: snapshot.profile,
        }),
    }),
    { name: 'ldcn-ai-preferences-v1' },
  ),
);

export function aiPreferencesSnapshot(state: AiPreferencesState): AiPreferencesSnapshot {
  const { sliders, flags, memory, agents, security, profile } = state;
  return { sliders, flags, memory, agents, security, profile };
}
