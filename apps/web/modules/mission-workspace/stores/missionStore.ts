import { create } from 'zustand';

import { missionClient } from '../api/client';
import { AICouncil, type FieldActionAuth } from '../ai/AICouncil';
import { ContextEngine } from '../engine/ContextEngine';
import { MissionEngine } from '../engine/MissionEngine';
import { getMissionGenome } from '../registry';
import type {
  AISuggestion,
  DecisionSource,
  ExecutionMode,
  ExperienceLevel,
  MissionContext,
  MissionGenome,
  MissionInstance,
  MissionTypeId,
  ImpactAnalysis,
} from '../types';

const AUTOSAVE_DEBOUNCE_MS = 2000;
let autosaveTimer: ReturnType<typeof setTimeout> | null = null;

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export interface PendingImpact { readonly stepId: string; readonly fieldId: string; readonly value: unknown; readonly analysis: ImpactAnalysis; }

interface MissionStoreState {
  readonly activeMission: MissionInstance | null;
  readonly activeGenome: MissionGenome | null;
  readonly leftPanelCollapsed: boolean;
  readonly rightPanelCollapsed: boolean;
  readonly saveStatus: SaveStatus;
  readonly lastSavedAt: Date | null;
  readonly aiLoading: Record<string, boolean>;
  readonly pendingSuggestion: AISuggestion | null;
  readonly pendingImpact: PendingImpact | null;
  readonly loading: boolean;
  readonly error: string | null;

  startMission: (typeId: MissionTypeId, config?: { title?: string; mode?: ExecutionMode; experienceLevel?: ExperienceLevel }) => Promise<MissionInstance>;
  loadMission: (missionId: string) => Promise<void>;
  updateAnswer: (stepId: string, fieldId: string, value: unknown) => void;
  confirmImpact: () => void;
  cancelImpact: () => void;
  goToStep: (stepId: string) => void;
  advanceStep: () => { success: boolean };
  executeFieldAction: (stepId: string, fieldId: string, actionId: string, auth: FieldActionAuth) => Promise<void>;
  acceptSuggestion: () => void;
  modifySuggestion: (content: string) => void;
  rejectSuggestion: (reason?: string) => void;
  decideGap: (gapId: string, action: 'addressed' | 'dismissed') => void;
  dismissRisk: (riskId: string) => void;
  generateArtifacts: (auth: FieldActionAuth) => Promise<void>;
  flushAutosave: () => Promise<void>;
  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  reset: () => void;
}

function recompute(genome: MissionGenome, context: MissionContext) {
  const gaps = MissionEngine.detectGaps(genome, context);
  const risks = MissionEngine.detectRisks(genome, context);
  const inconsistencies = MissionEngine.detectInconsistencies(genome, context);
  const nextContext: MissionContext = { ...context, gaps, risks, inconsistencies };
  const journey = MissionEngine.computeJourney(genome, nextContext);
  return { context: nextContext, journey };
}

function scheduleAutosave(get: () => MissionStoreState, set: (partial: Partial<MissionStoreState>) => void) {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    void get().flushAutosave();
  }, AUTOSAVE_DEBOUNCE_MS);
  set({ saveStatus: 'idle' });
}

export const useMissionStore = create<MissionStoreState>((set, get) => ({
  activeMission: null,
  activeGenome: null,
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  saveStatus: 'idle',
  lastSavedAt: null,
  aiLoading: {},
  pendingSuggestion: null,
  pendingImpact: null,
  loading: false,
  error: null,

  startMission: async (typeId, config) => {
    set({ loading: true, error: null });
    try {
      const mission = await missionClient.create({
        mission_type: typeId,
        title: config?.title,
        mode: config?.mode,
        experience_level: config?.experienceLevel,
      });
      const genome = getMissionGenome(typeId);
      set({ activeMission: mission as unknown as MissionInstance, activeGenome: genome, loading: false });
      return mission as unknown as MissionInstance;
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Falha ao iniciar a missão.' });
      throw error;
    }
  },

  loadMission: async (missionId) => {
    set({ loading: true, error: null });
    try {
      const mission = await missionClient.get(missionId);
      const genome = getMissionGenome(mission.type);
      set({ activeMission: mission, activeGenome: genome, loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Falha ao carregar a missão.' });
    }
  },

  updateAnswer: (stepId, fieldId, value) => {
    const { activeMission, activeGenome } = get();
    if (!activeMission || !activeGenome) return;
    const normalized = MissionEngine.normalizeAnswerValue(activeGenome, activeMission.context, stepId, fieldId, value);
    const impact = ContextEngine.analyzeImpact(activeGenome, activeMission.context, stepId, fieldId, normalized);
    if (impact.hasImpact) {
      set({ pendingImpact: { stepId, fieldId, value: normalized, analysis: impact } });
      return;
    }
    const updatedContext = MissionEngine.updateAnswer(activeMission.context, stepId, fieldId, normalized);
    const { context, journey } = recompute(activeGenome, updatedContext);
    set({ activeMission: { ...activeMission, context, journey } });
    scheduleAutosave(get, set);
  },

  confirmImpact: () => {
    const { activeMission, activeGenome, pendingImpact } = get();
    if (!activeMission || !activeGenome || !pendingImpact) return;
    let context = MissionEngine.updateAnswer(activeMission.context, pendingImpact.stepId, pendingImpact.fieldId, pendingImpact.value);
    context = ContextEngine.recordDecision(context, pendingImpact.stepId, pendingImpact.fieldId, pendingImpact.value, 'user', pendingImpact.analysis.message, pendingImpact.analysis.impactedSteps);
    const computed = recompute(activeGenome, context);
    set({ activeMission: { ...activeMission, ...computed }, pendingImpact: null });
    scheduleAutosave(get, set);
  },

  cancelImpact: () => set({ pendingImpact: null }),

  goToStep: (stepId) => {
    const { activeMission } = get();
    if (!activeMission) return;
    set({ activeMission: { ...activeMission, journey: { ...activeMission.journey, currentStepId: stepId } } });
    scheduleAutosave(get, set);
  },

  advanceStep: () => {
    const { activeMission, activeGenome } = get();
    if (!activeMission || !activeGenome) return { success: false };
    const result = MissionEngine.advanceStep(activeGenome, activeMission.journey, activeMission.context);
    if (result.success && result.journey) {
      set({ activeMission: { ...activeMission, journey: result.journey } });
      scheduleAutosave(get, set);
    }
    return { success: result.success };
  },

  executeFieldAction: async (stepId, fieldId, actionId, auth) => {
    const { activeMission, activeGenome } = get();
    if (!activeMission || !activeGenome) return;
    const step = MissionEngine.resolveActiveSteps(activeGenome, activeMission.context).find((s) => s.id === stepId);
    const field = step?.fields.find((f) => f.id === fieldId);
    const action = field?.aiActions.find((a) => a.id === actionId);
    if (!step || !action) return;

    set({ aiLoading: { ...get().aiLoading, [fieldId]: true } });
    try {
      const result = await AICouncil.executeFieldAction(activeMission.id, step, fieldId, action, activeMission.context, auth);
      // The preview keeps `proposed` as the raw LLM string for the review
      // modal (the user edits it as text even for a chips field); only the
      // impact-analysis probe below needs the array-coerced shape so it
      // doesn't crash evaluating conditional steps that expect an array.
      const normalizedProposed = MissionEngine.normalizeAnswerValue(activeGenome, activeMission.context, stepId, fieldId, result.suggestion.proposed);
      const impact = ContextEngine.analyzeImpact(activeGenome, activeMission.context, stepId, fieldId, normalizedProposed);
      set({ pendingSuggestion: { ...result.suggestion, impact: impact.hasImpact ? impact.message : result.suggestion.impact } });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Falha ao executar ação de IA.' });
    } finally {
      set({ aiLoading: { ...get().aiLoading, [fieldId]: false } });
    }
  },

  acceptSuggestion: () => {
    const { pendingSuggestion, activeMission, activeGenome } = get();
    if (!pendingSuggestion || !activeMission || !activeGenome) return;
    const normalized = MissionEngine.normalizeAnswerValue(activeGenome, activeMission.context, pendingSuggestion.stepId, pendingSuggestion.fieldId, pendingSuggestion.proposed);
    const impact = ContextEngine.analyzeImpact(activeGenome, activeMission.context, pendingSuggestion.stepId, pendingSuggestion.fieldId, normalized);
    let context = MissionEngine.updateAnswer(activeMission.context, pendingSuggestion.stepId, pendingSuggestion.fieldId, normalized);
    context = ContextEngine.recordDecision(context, pendingSuggestion.stepId, pendingSuggestion.fieldId, normalized, 'ai_accepted' as DecisionSource, pendingSuggestion.reason, impact.impactedSteps);
    const computed = recompute(activeGenome, context);
    set({ activeMission: { ...activeMission, ...computed }, pendingSuggestion: null });
    scheduleAutosave(get, set);
  },

  modifySuggestion: (content) => {
    const { pendingSuggestion } = get();
    if (!pendingSuggestion) return;
    set({ pendingSuggestion: { ...pendingSuggestion, proposed: content } });
  },

  rejectSuggestion: (reason) => {
    // Rejections are surfaced (never silently dropped) but kept client-side
    // for this session -- not autosaved to the backend, since the only
    // consequence is "don't apply the suggestion", which is already
    // satisfied by discarding pendingSuggestion.
    const { pendingSuggestion, activeMission } = get();
    if (!pendingSuggestion || !activeMission) return;
    const context = ContextEngine.recordRejection(activeMission.context, pendingSuggestion.id, reason);
    set({ activeMission: { ...activeMission, context }, pendingSuggestion: null });
    scheduleAutosave(get, set);
  },

  decideGap: (gapId, action) => {
    const { activeMission, activeGenome } = get();
    if (!activeMission || !activeGenome) return;
    const gaps = activeMission.context.gaps.map((gap) => (gap.id === gapId ? { ...gap, status: action } : gap));
    const context = { ...activeMission.context, gaps };
    set({ activeMission: { ...activeMission, context } });
    scheduleAutosave(get, set);
  },

  dismissRisk: (riskId) => {
    const { activeMission } = get();
    if (!activeMission) return;
    const risks = activeMission.context.risks.map((risk) => (risk.id === riskId ? { ...risk, dismissed: true } : risk));
    const context = { ...activeMission.context, risks };
    set({ activeMission: { ...activeMission, context } });
    scheduleAutosave(get, set);
  },

  generateArtifacts: async (auth) => {
    const { activeMission, activeGenome } = get();
    if (!activeMission || !activeGenome) return;
    set({ loading: true, error: null });
    try {
      const activeSteps = MissionEngine.resolveActiveSteps(activeGenome, activeMission.context);
      const stepTitles = Object.fromEntries(activeSteps.map((step) => [step.id, step.title]));
      const updated = await missionClient.generateArtifacts(activeMission.id, {
        artifact_definitions: activeGenome.artifacts.map((definition) => ({ type: definition.type, title: definition.title, can_feed_mission: [...(definition.canFeedMission ?? [])] })),
        step_titles: stepTitles,
        user_model_choice: auth.userModelChoice,
        use_user_key: auth.useUserKey,
      });
      set({ activeMission: updated, loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Falha ao gerar artefatos.' });
    }
  },

  flushAutosave: async () => {
    const { activeMission } = get();
    if (!activeMission) return;
    set({ saveStatus: 'saving' });
    try {
      const saved = await ContextEngine.save(activeMission.id, { context: activeMission.context, journey: activeMission.journey });
      set({ activeMission: saved, saveStatus: 'saved', lastSavedAt: new Date() });
    } catch {
      set({ saveStatus: 'error' });
    }
  },

  toggleLeftPanel: () => set({ leftPanelCollapsed: !get().leftPanelCollapsed }),
  toggleRightPanel: () => set({ rightPanelCollapsed: !get().rightPanelCollapsed }),

  reset: () => {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    set({ activeMission: null, activeGenome: null, pendingSuggestion: null, pendingImpact: null, saveStatus: 'idle', lastSavedAt: null, error: null });
  },
}));
