import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { missionClient } from '../api/client';
import { ContextEngine } from '../engine/ContextEngine';
import { MissionEngine } from '../engine/MissionEngine';
import { getMissionGenome } from '../registry';
import { createEmptyMissionContext } from '../types';
import type {
  ExecutionMode, FieldAIAction, InputType, JourneyState, MissionArtifact, MissionContext,
  MissionFieldDefinition, MissionInstance, MissionStepDefinition, MissionTypeId, SpecialistRole,
} from '../types';

export type WorkspacePanelId = 'genome' | 'context' | 'journey' | 'specialists' | 'assistant' | 'modes' | 'risks' | 'inputs' | 'artifacts';
export type DetailKind = 'objective' | 'step' | 'specialist' | 'risk' | 'input' | 'artifact' | 'assistant' | 'ai-required';
export interface DetailState { kind: DetailKind; id?: string; }
export interface DraftFile { id: string; name: string; size: number; mediaType: string; }
export interface AssistantDraft {
  stepId: string; fieldId: string; actionId: string; actionLabel: string;
  current: string; proposed: string; reason: string; loading: boolean; error: string | null;
}

interface WorkspaceDraftState {
  selectedMissionId: MissionTypeId;
  executionMode: ExecutionMode;
  selectedContextSources: InputType[];
  activeSpecialists: SpecialistRole[];
  currentStepId: string;
  objective: string;
  inputValues: Partial<Record<InputType, string>>;
  files: DraftFile[];
  fieldDrafts: Record<string, string>;
  riskStates: Record<string, 'open' | 'reviewed' | 'accepted'>;
  viewedArtifacts: string[];
  collapsedPanels: Partial<Record<WorkspacePanelId, boolean>>;
  detail: DetailState | null;
  pendingSpecialistRemoval: SpecialistRole | null;
  assistantDraft: AssistantDraft | null;
  draftMissionId: string | null;
  saveStatus: 'idle' | 'saving' | 'saved' | 'error';
  lastSavedAt: string | null;
  isStarting: boolean;
  error: string | null;
  notice: string | null;
  hydrated: boolean;

  selectMission: (id: MissionTypeId) => void;
  setExecutionMode: (mode: ExecutionMode) => void;
  setObjective: (value: string) => void;
  selectContextSource: (source: InputType) => void;
  deselectContextSource: (source: InputType) => void;
  setInputValue: (source: InputType, value: string) => void;
  addFiles: (files: FileList | readonly File[]) => void;
  goToStep: (stepId: string) => { success: boolean; reason?: string };
  requestSpecialistToggle: (role: SpecialistRole) => void;
  confirmSpecialistRemoval: () => void;
  resolveRisk: (id: string, resolution: 'reviewed' | 'accepted') => void;
  viewArtifact: (type: string) => void;
  togglePanel: (id: WorkspacePanelId) => void;
  openDetail: (detail: DetailState) => void;
  closeDetail: () => void;
  runAssistant: (step: MissionStepDefinition, field: MissionFieldDefinition, action: FieldAIAction, model: string) => Promise<void>;
  acceptAssistant: () => void;
  rejectAssistant: () => void;
  startMission: (hasValidatedAI: boolean) => Promise<MissionInstance>;
  clearFeedback: () => void;
  markHydrated: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const aiModes = new Set<ExecutionMode>(['guided', 'quick', 'analysis', 'collaborative', 'autonomous', 'learning']);
function mission(id: MissionTypeId) {
  const genome = getMissionGenome(id);
  if (!genome) throw new Error(`Missão não registrada: ${id}`);
  return genome;
}
function firstMode(id: MissionTypeId): ExecutionMode { return mission(id).executionModes[0] ?? 'guided'; }
function firstStep(id: MissionTypeId): string { return mission(id).steps[0]?.id ?? ''; }
function markSaving(set: (partial: Partial<WorkspaceDraftState>) => void) {
  if (saveTimer) clearTimeout(saveTimer);
  set({ saveStatus: 'saving' });
  saveTimer = setTimeout(() => set({ saveStatus: 'saved', lastSavedAt: new Date().toISOString() }), 600);
}
export function stepsForMode(id: MissionTypeId, mode: ExecutionMode): readonly MissionStepDefinition[] {
  const steps = mission(id).steps;
  if (mode !== 'quick' || steps.length <= 4) return steps;
  return steps.filter((step, index) => index < 2 || index === steps.length - 1 || step.isRequired);
}
export function journeyForDraft(state: Pick<WorkspaceDraftState, 'selectedMissionId' | 'executionMode' | 'currentStepId' | 'objective'>): JourneyState {
  const steps = stepsForMode(state.selectedMissionId, state.executionMode);
  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === state.currentStepId));
  return {
    currentStepId: steps[currentIndex]?.id ?? null,
    progress: state.objective.trim() ? Math.round(((currentIndex + 1) / Math.max(1, steps.length)) * 100) : 0,
    steps: steps.map((step, index) => ({
      definitionId: step.id,
      status: index < currentIndex ? 'completed' : index === currentIndex ? 'active' : index > currentIndex + 1 ? 'blocked' : 'pending',
      completedAt: index < currentIndex ? new Date().toISOString() : null,
      alerts: [],
    })),
  };
}

export const useWorkspaceDraftStore = create<WorkspaceDraftState>()(persist((set, get) => ({
  selectedMissionId: 'software.build',
  executionMode: firstMode('software.build'),
  selectedContextSources: [],
  activeSpecialists: [...mission('software.build').specialists],
  currentStepId: firstStep('software.build'),
  objective: '',
  inputValues: {},
  files: [],
  fieldDrafts: {},
  riskStates: {},
  viewedArtifacts: [],
  collapsedPanels: {},
  detail: null,
  pendingSpecialistRemoval: null,
  assistantDraft: null,
  draftMissionId: null,
  saveStatus: 'idle',
  lastSavedAt: null,
  isStarting: false,
  error: null,
  notice: null,
  hydrated: false,

  selectMission: (id) => {
    const genome = mission(id);
    set({
      selectedMissionId: id, executionMode: genome.executionModes[0] ?? 'guided',
      activeSpecialists: [...genome.specialists], currentStepId: genome.steps[0]?.id ?? '',
      riskStates: {}, viewedArtifacts: [], assistantDraft: null, draftMissionId: null,
      error: null, notice: `Missão selecionada: ${genome.title}.`,
    });
    markSaving(set);
  },
  setExecutionMode: (mode) => {
    const state = get();
    if (!mission(state.selectedMissionId).executionModes.includes(mode)) return;
    const nextSteps = stepsForMode(state.selectedMissionId, mode);
    set({ executionMode: mode, currentStepId: nextSteps.some((step) => step.id === state.currentStepId) ? state.currentStepId : nextSteps[0]?.id ?? '', notice: `Modo ${mode} ativado.`, draftMissionId: null });
    markSaving(set);
  },
  setObjective: (objective) => { set({ objective, error: null, draftMissionId: null }); markSaving(set); },
  selectContextSource: (source) => {
    const selected = get().selectedContextSources;
    set({ selectedContextSources: selected.includes(source) ? selected : [...selected, source], detail: { kind: source === 'text' ? 'objective' : 'input', id: source }, notice: `Entrada “${source}” adicionada ao contexto.`, draftMissionId: null });
    markSaving(set);
  },
  deselectContextSource: (source) => { set({ selectedContextSources: get().selectedContextSources.filter((item) => item !== source), draftMissionId: null }); markSaving(set); },
  setInputValue: (source, value) => { set({ inputValues: { ...get().inputValues, [source]: value }, draftMissionId: null }); markSaving(set); },
  addFiles: (input) => {
    const added = Array.from(input).map((file) => ({ id: `file_${Date.now()}_${file.name}`, name: file.name, size: file.size, mediaType: file.type || 'application/octet-stream' }));
    set({ files: [...get().files, ...added], draftMissionId: null, notice: `${added.length} arquivo(s) adicionado(s).` });
    markSaving(set);
  },
  goToStep: (stepId) => {
    const state = get(); const steps = stepsForMode(state.selectedMissionId, state.executionMode); const target = steps.findIndex((step) => step.id === stepId); const current = Math.max(0, steps.findIndex((step) => step.id === state.currentStepId));
    if (target > current + 1) { const reason = `Conclua “${steps[current]?.title ?? 'a etapa atual'}” antes de avançar.`; set({ detail: { kind: 'step', id: stepId }, error: reason }); return { success: false, reason }; }
    set({ currentStepId: stepId, detail: { kind: 'step', id: stepId }, error: null, notice: `Etapa aberta: ${steps[target]?.title}.` }); markSaving(set); return { success: true };
  },
  requestSpecialistToggle: (role) => {
    const active = get().activeSpecialists; const required = mission(get().selectedMissionId).specialists[0] === role;
    if (active.includes(role) && required) { set({ pendingSpecialistRemoval: role, detail: { kind: 'specialist', id: role } }); return; }
    set({ activeSpecialists: active.includes(role) ? active.filter((item) => item !== role) : [...active, role], detail: { kind: 'specialist', id: role }, draftMissionId: null }); markSaving(set);
  },
  confirmSpecialistRemoval: () => {
    const role = get().pendingSpecialistRemoval; if (!role) return;
    set({ activeSpecialists: get().activeSpecialists.filter((item) => item !== role), pendingSpecialistRemoval: null, notice: 'Especialista obrigatório removido com confirmação.', draftMissionId: null }); markSaving(set);
  },
  resolveRisk: (id, resolution) => { set({ riskStates: { ...get().riskStates, [id]: resolution }, notice: resolution === 'reviewed' ? 'Risco encaminhado para revisão.' : 'Risco mantido com justificativa registrada.', draftMissionId: null }); markSaving(set); },
  viewArtifact: (type) => { const viewed = get().viewedArtifacts; set({ viewedArtifacts: viewed.includes(type) ? viewed : [...viewed, type], detail: { kind: 'artifact', id: type } }); markSaving(set); },
  togglePanel: (id) => { set({ collapsedPanels: { ...get().collapsedPanels, [id]: !get().collapsedPanels[id] } }); markSaving(set); },
  openDetail: (detail) => set({ detail }),
  closeDetail: () => set({ detail: null, pendingSpecialistRemoval: null }),
  runAssistant: async (step, field, action, model) => {
    const key = `${step.id}.${field.id}`; const current = get().fieldDrafts[key] ?? (field.id.includes('objective') || field.id.includes('description') ? get().objective : '');
    set({ assistantDraft: { stepId: step.id, fieldId: field.id, actionId: action.id, actionLabel: action.label, current, proposed: '', reason: 'Aguardando resposta do especialista.', loading: true, error: null }, detail: { kind: 'assistant', id: key }, error: null });
    try {
      const created = await get().startMission(true);
      const context = created.context;
      const result = await missionClient.executeFieldAction(created.id, { step_id: step.id, field_id: field.id, action_id: action.id, specialist: step.specialist ?? null, interpolated_prompt: ContextEngine.interpolatePrompt(action.prompt, context), insert_mode: action.insertMode, user_model_choice: model, use_user_key: true });
      set({ assistantDraft: { stepId: step.id, fieldId: field.id, actionId: action.id, actionLabel: action.label, current, proposed: result.content, reason: 'Proposta gerada com sua API key. Nada foi aplicado automaticamente.', loading: false, error: null } });
    } catch (error) {
      set({ assistantDraft: { ...get().assistantDraft!, loading: false, error: error instanceof Error ? error.message : 'Falha ao executar assistência.' } });
    }
  },
  acceptAssistant: () => {
    const draft = get().assistantDraft; if (!draft || draft.loading || draft.error) return;
    const key = `${draft.stepId}.${draft.fieldId}`; const objectiveField = draft.fieldId.includes('objective') || draft.fieldId.includes('description');
    set({ fieldDrafts: { ...get().fieldDrafts, [key]: draft.proposed }, objective: objectiveField ? draft.proposed : get().objective, assistantDraft: null, detail: null, notice: 'Sugestão aceita e registrada.', draftMissionId: null }); markSaving(set);
  },
  rejectAssistant: () => { set({ assistantDraft: null, detail: null, notice: 'Sugestão rejeitada. Nenhum dado foi alterado.' }); markSaving(set); },
  startMission: async (hasValidatedAI) => {
    const state = get(); const genome = mission(state.selectedMissionId);
    if (!state.objective.trim()) { set({ error: 'Defina um objetivo antes de iniciar.', detail: { kind: 'objective' } }); throw new Error('Defina um objetivo antes de iniciar.'); }
    if (aiModes.has(state.executionMode) && !hasValidatedAI) { set({ error: 'Conecte e valide um provider de IA para este modo.', detail: { kind: 'ai-required' } }); throw new Error('Conecte e valide um provider de IA para este modo.'); }
    if (state.draftMissionId) return missionClient.get(state.draftMissionId);
    set({ isStarting: true, error: null, notice: null });
    try {
      const created = await missionClient.create({ mission_type: state.selectedMissionId, title: state.objective.slice(0, 100), mode: state.executionMode, experience_level: 'intermediate' });
      let context: MissionContext = {
        ...createEmptyMissionContext(),
        inputs: {
          text: [state.objective],
          files: state.files,
          code: state.inputValues.code ? [{ id: 'draft_code', content: state.inputValues.code }] : [],
          logs: state.inputValues.logs ? [state.inputValues.logs] : [],
          urls: state.inputValues.urls ? [state.inputValues.urls] : [],
          schemas: state.inputValues.schemas ? [state.inputValues.schemas] : [],
          projectRef: state.inputValues.project_ref || undefined,
        },
        answers: { [`${genome.steps[0]?.id ?? 'step_1'}.objective`]: state.objective, ...state.fieldDrafts },
        decisions: [{ id: `draft_${Date.now()}`, stepId: genome.steps[0]?.id ?? 'step_1', fieldId: 'objective', value: state.objective, source: 'user', reason: 'Definido no Mission Workspace.', timestamp: new Date().toISOString(), impacts: [] }],
        derived: { selectedContextSources: state.selectedContextSources, activeSpecialists: state.activeSpecialists },
      };
      context = { ...context, gaps: MissionEngine.detectGaps(genome, context), risks: MissionEngine.detectRisks(genome, context), inconsistencies: MissionEngine.detectInconsistencies(genome, context) };
      const journey = MissionEngine.computeJourney(genome, context, state.currentStepId);
      const saved = await missionClient.autosave(created.id, { context, journey, mode: state.executionMode, version: created.version });
      set({ draftMissionId: saved.id, isStarting: false, saveStatus: 'saved', lastSavedAt: new Date().toISOString(), notice: 'Missão criada. Abrindo a primeira etapa.' });
      return saved;
    } catch (error) {
      set({ isStarting: false, error: error instanceof Error ? error.message : 'Não foi possível iniciar a missão.', saveStatus: 'error' });
      throw error;
    }
  },
  clearFeedback: () => set({ error: null, notice: null }),
  markHydrated: () => set({ hydrated: true }),
}), {
  name: 'ldcn.mission-workspace.draft.v1',
  version: 1,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    selectedMissionId: state.selectedMissionId, executionMode: state.executionMode,
    selectedContextSources: state.selectedContextSources, activeSpecialists: state.activeSpecialists,
    currentStepId: state.currentStepId, objective: state.objective, inputValues: state.inputValues,
    files: state.files, fieldDrafts: state.fieldDrafts, riskStates: state.riskStates,
    viewedArtifacts: state.viewedArtifacts, collapsedPanels: state.collapsedPanels,
    draftMissionId: state.draftMissionId, lastSavedAt: state.lastSavedAt,
  }),
  onRehydrateStorage: () => (state) => state?.markHydrated(),
}));

export function artifactStatus(type: string, viewed: readonly string[], generated: readonly MissionArtifact[] = []): 'not_started' | 'previewed' | 'generated' {
  if (generated.some((artifact) => artifact.type === type)) return 'generated';
  return viewed.includes(type) ? 'previewed' : 'not_started';
}
