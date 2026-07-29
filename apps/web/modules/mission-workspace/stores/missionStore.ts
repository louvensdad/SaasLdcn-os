import { create } from 'zustand';

import { missionClient } from '../api/client';
import type { DeliverableJobDto, DeliverableJobEventDto, DeliverableJobStatus } from '../api/client';
import { AICouncil, type FieldActionAuth } from '../ai/AICouncil';
import { ContextEngine } from '../engine/ContextEngine';
import { MissionEngine } from '../engine/MissionEngine';
import { getMissionGenome } from '../registry';
import type {
  AISuggestion,
  ArtifactDraft,
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
/** Aborts the in-flight SSE fetch (see missionClient.streamDeliverableJob) on
 * a new job start / unmount, same module-level-controller pattern as the
 * autosave timer above. */
let deliverableStreamController: AbortController | null = null;
const DELIVERABLE_JOB_NON_TERMINAL: readonly DeliverableJobStatus[] = ['QUEUED', 'ANSWERS_LOADING', 'DRAFTING', 'PERSISTING'];

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';
export interface PendingImpact { readonly stepId: string; readonly fieldId: string; readonly value: unknown; readonly analysis: ImpactAnalysis; }
/** IDLE/VALIDATING are frontend-only (no job exists yet); every other value
 * is a real backend DeliverableJobStatus, never a fake/simulated stage. */
export type DeliverableJobPhase = 'IDLE' | 'VALIDATING' | DeliverableJobStatus;

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
  /** Staged, per-artifact drafts awaiting explicit user review -- nothing
   * here is saved until confirmArtifacts() is called. Never auto-accepted. */
  readonly pendingArtifacts: readonly ArtifactDraft[] | null;
  readonly artifactsDegraded: boolean;
  readonly loading: boolean;
  readonly error: string | null;

  /** Async, SSE-tracked artifact-drafting job backing the "Gerar
   * entregáveis" buttons -- real progress instead of one blocking POST. */
  readonly deliverableJob: DeliverableJobDto | null;
  readonly deliverableJobPhase: DeliverableJobPhase;
  readonly deliverableJobEvents: readonly DeliverableJobEventDto[];
  readonly deliverableJobIdempotencyKey: string | null;

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
  previewArtifacts: (auth: FieldActionAuth) => Promise<void>;
  editPendingArtifact: (index: number, content: string) => void;
  confirmArtifacts: () => Promise<void>;
  cancelArtifactsPreview: () => void;
  startDeliverablesJob: (auth: FieldActionAuth) => Promise<void>;
  restoreDeliverableJob: () => Promise<void>;
  confirmDeliverableJob: () => Promise<void>;
  retryDeliverableJob: (auth: FieldActionAuth) => Promise<void>;
  cancelDeliverableJob: () => Promise<void>;
  dismissDeliverableJob: () => void;
  refreshDeliverableJob: () => Promise<void>;
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

/** Opens (replacing any prior) SSE tracking for a deliverable job. Every UI
 * signal here comes from a real persisted backend event -- never a
 * setTimeout-simulated stage. Shared by startDeliverablesJob (fresh job),
 * restoreDeliverableJob (refresh/new-login resume) and retryDeliverableJob. */
function attachDeliverableStream(
  get: () => MissionStoreState, set: (partial: Partial<MissionStoreState>) => void, missionId: string, jobId: string,
) {
  deliverableStreamController?.abort();
  const controller = new AbortController();
  deliverableStreamController = controller;
  void missionClient.streamDeliverableJob(
    missionId, jobId,
    (job) => {
      const patch: Partial<MissionStoreState> = { deliverableJob: job, deliverableJobPhase: job.status };
      if (job.status === 'DRAFTS_READY') Object.assign(patch, { pendingArtifacts: job.drafts, artifactsDegraded: job.degraded });
      if (job.status === 'FAILED' && job.error) Object.assign(patch, { error: job.error.message });
      set(patch);
    },
    controller.signal,
    (event) => set({ deliverableJobEvents: [...get().deliverableJobEvents, event].slice(-200) }),
  ).catch((error) => {
    if (controller.signal.aborted) return;
    set({ error: error instanceof Error ? error.message : 'Falha ao acompanhar o progresso dos entregáveis.' });
  });
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
  pendingArtifacts: null,
  artifactsDegraded: false,
  loading: false,
  error: null,
  deliverableJob: null,
  deliverableJobPhase: 'IDLE',
  deliverableJobEvents: [],
  deliverableJobIdempotencyKey: null,

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

  previewArtifacts: async (auth) => {
    const { activeMission, activeGenome } = get();
    if (!activeMission || !activeGenome) return;
    set({ loading: true, error: null });
    try {
      const activeSteps = MissionEngine.resolveActiveSteps(activeGenome, activeMission.context);
      const stepTitles = Object.fromEntries(activeSteps.map((step) => [step.id, step.title]));
      const result = await missionClient.previewArtifacts(activeMission.id, {
        artifact_definitions: activeGenome.artifacts.map((definition) => ({ type: definition.type, title: definition.title, can_feed_mission: [...(definition.canFeedMission ?? [])] })),
        step_titles: stepTitles,
        user_model_choice: auth.userModelChoice,
        use_user_key: auth.useUserKey,
      });
      set({ pendingArtifacts: result.drafts, artifactsDegraded: result.degraded, loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Falha ao gerar rascunho dos artefatos.' });
    }
  },

  editPendingArtifact: (index, content) => {
    const { pendingArtifacts } = get();
    if (!pendingArtifacts) return;
    set({ pendingArtifacts: pendingArtifacts.map((draft, i) => (i === index ? { ...draft, content } : draft)) });
  },

  confirmArtifacts: async () => {
    // pendingArtifacts is populated from a deliverable job's drafts once it
    // reaches DRAFTS_READY (see attachDeliverableStream) -- when that's the
    // source, confirming must go through the job so it gets marked COMPLETED
    // and its persisted drafts are what actually get saved.
    if (get().deliverableJob) { await get().confirmDeliverableJob(); return; }
    const { activeMission, pendingArtifacts } = get();
    if (!activeMission || !pendingArtifacts) return;
    set({ loading: true, error: null });
    try {
      const updated = await missionClient.confirmArtifacts(activeMission.id, [...pendingArtifacts]);
      set({ activeMission: updated, pendingArtifacts: null, artifactsDegraded: false, loading: false });
    } catch (error) {
      set({ loading: false, error: error instanceof Error ? error.message : 'Falha ao salvar os artefatos.' });
    }
  },

  cancelArtifactsPreview: () => {
    const { deliverableJob } = get();
    if (deliverableJob && deliverableJob.status !== 'DRAFTS_READY') {
      // Job is still actually running -- ask the backend to stop it
      // cooperatively; deliverableJobPhase keeps tracking until CANCELLED.
      void get().cancelDeliverableJob();
    } else if (deliverableJob) {
      // Drafts were already fully generated (DRAFTS_READY) -- there is
      // nothing left to cancel server-side. Reset straight to IDLE so the
      // "Gerar entregáveis" button reappears instead of leaving the
      // timeline stuck showing a job that will never move again.
      set({ deliverableJob: null, deliverableJobPhase: 'IDLE', deliverableJobIdempotencyKey: null });
    }
    set({ pendingArtifacts: null, artifactsDegraded: false });
  },

  startDeliverablesJob: async (auth) => {
    // Synchronous, before any await: this is what makes the click register
    // in under 300ms -- plain state, never gated on the network.
    set({ deliverableJobPhase: 'VALIDATING', error: null });
    const { activeMission, activeGenome } = get();
    if (!activeMission || !activeGenome) { set({ deliverableJobPhase: 'IDLE' }); return; }
    const idempotencyKey = get().deliverableJobIdempotencyKey ?? crypto.randomUUID();
    set({ deliverableJobIdempotencyKey: idempotencyKey });
    await get().flushAutosave();
    set({ deliverableJobPhase: 'QUEUED' });
    try {
      const activeSteps = MissionEngine.resolveActiveSteps(activeGenome, activeMission.context);
      const stepTitles = Object.fromEntries(activeSteps.map((step) => [step.id, step.title]));
      const job = await missionClient.compileDeliverables(activeMission.id, {
        artifact_definitions: activeGenome.artifacts.map((definition) => ({ type: definition.type, title: definition.title, can_feed_mission: [...(definition.canFeedMission ?? [])] })),
        step_titles: stepTitles,
        user_model_choice: auth.userModelChoice,
        use_user_key: auth.useUserKey,
        idempotency_key: idempotencyKey,
      });
      set({ deliverableJob: job, deliverableJobPhase: job.status, deliverableJobEvents: [] });
      if (job.status === 'DRAFTS_READY') { set({ pendingArtifacts: job.drafts, artifactsDegraded: job.degraded }); return; }
      if (DELIVERABLE_JOB_NON_TERMINAL.includes(job.status)) attachDeliverableStream(get, set, activeMission.id, job.id);
    } catch (error) {
      set({ deliverableJobPhase: 'IDLE', error: error instanceof Error ? error.message : 'Falha ao iniciar a geração de entregáveis.' });
    }
  },

  restoreDeliverableJob: async () => {
    const { activeMission } = get();
    if (!activeMission) return;
    try {
      const job = await missionClient.latestDeliverableJob(activeMission.id);
      if (!job) return;
      set({ deliverableJob: job, deliverableJobPhase: job.status, deliverableJobIdempotencyKey: job.idempotencyKey ?? get().deliverableJobIdempotencyKey });
      if (job.status === 'DRAFTS_READY') { set({ pendingArtifacts: job.drafts, artifactsDegraded: job.degraded }); return; }
      if (DELIVERABLE_JOB_NON_TERMINAL.includes(job.status)) attachDeliverableStream(get, set, activeMission.id, job.id);
    } catch {
      // No job yet, or a transient fetch failure -- the final step just shows
      // the idle button in that case, not an error banner on page load.
    }
  },

  confirmDeliverableJob: async () => {
    const { activeMission, deliverableJob, pendingArtifacts } = get();
    if (!activeMission || !deliverableJob) return;
    set({ deliverableJobPhase: 'PERSISTING', loading: true, error: null });
    try {
      // pendingArtifacts holds whatever the user reviewed (and possibly
      // edited via editPendingArtifact) in ArtifactsReviewModal -- that is
      // what must be persisted, not the job's original unedited drafts.
      const artifacts = pendingArtifacts && pendingArtifacts.length > 0 ? [...pendingArtifacts] : deliverableJob.drafts;
      const updated = await missionClient.confirmDeliverableJob(activeMission.id, deliverableJob.id, artifacts);
      // Keep deliverableJob (now COMPLETED) instead of nulling it -- the
      // completion summary reads real counts/timestamps off of it. Only an
      // explicit dismissDeliverableJob() (or starting a fresh job) clears it.
      set({
        activeMission: updated, pendingArtifacts: null, artifactsDegraded: false, loading: false,
        deliverableJob: { ...deliverableJob, status: 'COMPLETED' }, deliverableJobPhase: 'COMPLETED', deliverableJobIdempotencyKey: null,
      });
    } catch (error) {
      set({ deliverableJobPhase: 'DRAFTS_READY', loading: false, error: error instanceof Error ? error.message : 'Falha ao salvar os artefatos.' });
    }
  },

  retryDeliverableJob: async (auth) => {
    const { activeMission, deliverableJob } = get();
    if (!activeMission || !deliverableJob) return;
    set({ deliverableJobPhase: 'QUEUED', error: null });
    try {
      const job = await missionClient.retryDeliverableJob(activeMission.id, deliverableJob.id, { user_model_choice: auth.userModelChoice, use_user_key: true });
      set({ deliverableJob: job, deliverableJobPhase: job.status });
      if (job.status === 'DRAFTS_READY') { set({ pendingArtifacts: job.drafts, artifactsDegraded: job.degraded }); return; }
      if (DELIVERABLE_JOB_NON_TERMINAL.includes(job.status)) attachDeliverableStream(get, set, activeMission.id, job.id);
    } catch (error) {
      set({ deliverableJobPhase: 'FAILED', error: error instanceof Error ? error.message : 'Falha ao tentar novamente.' });
    }
  },

  cancelDeliverableJob: async () => {
    const { activeMission, deliverableJob } = get();
    if (!activeMission || !deliverableJob) return;
    try {
      // Cooperative cancellation (checked between artifacts server-side) --
      // the job keeps streaming until it actually reaches CANCELLED, so the
      // stream is intentionally left attached here, not aborted.
      const job = await missionClient.cancelDeliverableJob(activeMission.id, deliverableJob.id);
      set({ deliverableJob: job, deliverableJobPhase: job.status });
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Falha ao cancelar a geração.' });
    }
  },

  dismissDeliverableJob: () => {
    deliverableStreamController?.abort();
    set({ deliverableJob: null, deliverableJobPhase: 'IDLE', deliverableJobEvents: [], deliverableJobIdempotencyKey: null });
  },

  /** One-off re-fetch used when the client suspects the SSE stream went
   * stale (no event for 45s+) -- confirms real backend state rather than
   * guessing, per "consultar o backend" before ever declaring a job stuck. */
  refreshDeliverableJob: async () => {
    const { activeMission, deliverableJob } = get();
    if (!activeMission || !deliverableJob) return;
    try {
      const job = await missionClient.getDeliverableJob(activeMission.id, deliverableJob.id);
      const patch: Partial<MissionStoreState> = { deliverableJob: job, deliverableJobPhase: job.status };
      if (job.status === 'DRAFTS_READY' && !get().pendingArtifacts) Object.assign(patch, { pendingArtifacts: job.drafts, artifactsDegraded: job.degraded });
      set(patch);
    } catch (error) {
      set({ error: error instanceof Error ? error.message : 'Falha ao verificar o estado da execução.' });
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
    deliverableStreamController?.abort();
    deliverableStreamController = null;
    set({
      activeMission: null, activeGenome: null, pendingSuggestion: null, pendingImpact: null, pendingArtifacts: null,
      artifactsDegraded: false, saveStatus: 'idle', lastSavedAt: null, error: null,
      deliverableJob: null, deliverableJobPhase: 'IDLE', deliverableJobEvents: [], deliverableJobIdempotencyKey: null,
    });
  },
}));
