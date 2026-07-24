import { API_BASE_URL } from '@/lib/api/endpoints';
import { getAccessToken, refreshAccessToken } from '@/lib/api/client';
import { isRegisteredMissionType } from '../registry';
import { createEmptyMissionContext } from '../types';
import type {
  ArtifactDraft, ArtifactFormat, ArtifactType, Decision, ExecutionMode, ExperienceLevel, Gap, Inconsistency,
  JourneyState, MissionArtifact, MissionContext, MissionInstance, MissionInstanceSummary,
  MissionStatus, Rejection, Risk, SpecialistRole,
} from '../types';

const FIVE_MIN = 5 * 60 * 1000;
const THIRTY_SEC = 30 * 1000;
type JsonRecord = Record<string, unknown>;
const record = (value: unknown): JsonRecord => value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const string = (value: unknown, fallback = ''): string => typeof value === 'string' ? value : fallback;
const boolean = (value: unknown): boolean => value === true;
const number = (value: unknown, fallback = 0): number => typeof value === 'number' ? value : fallback;

export interface MissionFailureDiagnostic { status_current: string; status_expected: string[]; endpoint_called: string; http_status: number; backend_message: string; rejection_reason: string; correction: string; }
export class MissionApiError extends Error {
  constructor(readonly endpoint: string, readonly httpStatus: number, message: string, readonly diagnostic: MissionFailureDiagnostic | null) { super(message); this.name = 'MissionApiError'; }
}

function diagnostic(body: unknown): MissionFailureDiagnostic | null {
  const detail = record(record(body).detail);
  return typeof detail.backend_message === 'string' ? detail as unknown as MissionFailureDiagnostic : null;
}
function errorMessage(body: unknown, status: number): string {
  const value = record(body);
  if (typeof value.detail === 'string') return value.detail;
  const nested = record(value.error);
  return string(nested.message || value.message, `HTTP ${status}`);
}
async function request(path: string, init: RequestInit | undefined, timeoutMs: number, allowRefresh = true): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const accessToken = getAccessToken();
    const response = await fetch(`${API_BASE_URL}${path}`, {
      ...init, credentials: 'include', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(init?.headers ?? {}) },
    });
    const text = await response.text();
    const body: unknown = text ? JSON.parse(text) : null;
    if (!response.ok) {
      if (response.status === 401 && allowRefresh && await refreshAccessToken()) return request(path, init, timeoutMs, false);
      const detail = diagnostic(body);
      throw new MissionApiError(path, response.status, detail?.backend_message ?? errorMessage(body, response.status), detail);
    }
    return body;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw new MissionApiError(path, 408, 'A requisição expirou.', null);
    throw error instanceof Error ? error : new Error('Falha de rede ao contatar o backend.');
  } finally { clearTimeout(timer); }
}

function decision(value: unknown): Decision {
  const item = record(value);
  return { id: string(item.id), stepId: string(item.step_id), fieldId: string(item.field_id), value: item.value, source: string(item.source, 'user') as Decision['source'], reason: typeof item.reason === 'string' ? item.reason : null, timestamp: string(item.created_at || item.timestamp), impacts: array(item.impacts).map((impact) => { const i = record(impact); return { stepId: string(i.step_id || i.stepId), reason: string(i.reason), fieldIds: array(i.field_ids || i.fieldIds).map((field) => string(field)) }; }) };
}
function rejection(value: unknown): Rejection { const item = record(value); return { id: string(item.id), suggestionId: string(item.suggestion_id), reason: typeof item.reason === 'string' ? item.reason : undefined, timestamp: string(item.timestamp) }; }
function gap(value: unknown): Gap { const item = record(value); return { id: string(item.id), title: string(item.title), description: string(item.description), severity: string(item.severity, 'optional') as Gap['severity'], relatedStepId: typeof item.related_step_id === 'string' ? item.related_step_id : null, suggestedAction: string(item.suggested_action), status: string(item.status, 'open') as Gap['status'], dismissReason: typeof item.dismiss_reason === 'string' ? item.dismiss_reason : null }; }
function risk(value: unknown): Risk { const item = record(value); return { id: string(item.id), severity: string(item.severity, 'low') as Risk['severity'], category: string(item.category), title: string(item.title), description: string(item.description), affectedSteps: array(item.affected_steps).map((step) => string(step)), suggestedAction: string(item.suggested_action), autoDetected: item.auto_detected !== false, dismissed: boolean(item.dismissed) }; }
function inconsistency(value: unknown): Inconsistency { const item = record(value); return { id: string(item.id), title: string(item.title), description: string(item.description), affectedFields: array(item.affected_fields).map((field) => string(field)), suggestedFix: string(item.suggested_fix), blocking: boolean(item.blocking) }; }

function context(value: unknown): MissionContext {
  const item = record(value);
  const inputs = record(item.inputs);
  const empty = createEmptyMissionContext();
  return {
    inputs: { text: array(inputs.text).map((v) => string(v)), files: array(inputs.files) as MissionContext['inputs']['files'], code: array(inputs.code) as MissionContext['inputs']['code'], logs: array(inputs.logs).map((v) => string(v)), urls: array(inputs.urls).map((v) => string(v)), schemas: array(inputs.schemas).map((v) => string(v)), projectRef: typeof inputs.project_ref === 'string' ? inputs.project_ref : undefined },
    answers: record(item.answers), decisions: array(item.decisions).map(decision), rejections: array(item.rejections).map(rejection),
    gaps: array(item.gaps).map(gap), risks: array(item.risks).map(risk), inconsistencies: array(item.inconsistencies).map(inconsistency),
    history: Array.isArray(item.history) ? item.history as MissionContext['history'] : empty.history, derived: record(item.derived),
  };
}
function journey(value: unknown): JourneyState {
  const item = record(value);
  return { currentStepId: typeof item.current_step_id === 'string' ? item.current_step_id : null, progress: number(item.progress), steps: array(item.steps).map((value) => { const step = record(value); return { definitionId: string(step.definition_id), status: string(step.status, 'pending') as JourneyState['steps'][number]['status'], completedAt: typeof step.completed_at === 'string' ? step.completed_at : null, validationStatus: typeof step.validation_status === 'string' ? step.validation_status as JourneyState['steps'][number]['validationStatus'] : undefined, alerts: array(step.alerts) as JourneyState['steps'][number]['alerts'] }; }) };
}
function artifact(value: unknown): MissionArtifact {
  const item = record(value);
  return { id: string(item.id), type: string(item.type, 'report') as ArtifactType, title: string(item.title), content: item.content, format: string(item.format, 'markdown') as ArtifactFormat, generatedAt: string(item.generated_at), canFeedMission: array(item.can_feed_mission).filter((id): id is string => typeof id === 'string') as MissionArtifact['canFeedMission'] };
}
function artifactDraft(value: unknown): ArtifactDraft {
  const item = record(value);
  return { type: string(item.type, 'report') as ArtifactType, title: string(item.title), content: string(item.content), format: string(item.format, 'markdown') as ArtifactFormat, canFeedMission: array(item.can_feed_mission).filter((id): id is string => typeof id === 'string') as ArtifactDraft['canFeedMission'], degraded: boolean(item.degraded) };
}
function artifactDraftPayload(value: ArtifactDraft): JsonRecord {
  return { type: value.type, title: value.title, content: value.content, format: value.format, can_feed_mission: value.canFeedMission, degraded: value.degraded };
}
function mission(value: unknown): MissionInstance {
  const item = record(value);
  const type = string(item.type);
  if (!isRegisteredMissionType(type)) throw new Error(`Tipo de missão desconhecido recebido do backend: ${type}`);
  return { id: string(item.id), type, userId: typeof item.owner_user_id === 'string' ? item.owner_user_id : undefined, workspaceId: string(item.workspace_id), projectId: typeof item.project_id === 'string' ? item.project_id : undefined, status: string(item.status, 'active') as MissionStatus, mode: string(item.mode, 'guided') as ExecutionMode, experienceLevel: string(item.experience_level, 'intermediate') as ExperienceLevel, title: string(item.title), context: context(item.context), journey: journey(item.journey), artifacts: array(item.artifacts).map(artifact), degraded: boolean(item.degraded), createdAt: string(item.created_at), updatedAt: string(item.updated_at), version: number(item.version, 1) };
}
function summary(value: unknown): MissionInstanceSummary {
  const item = record(value);
  const type = string(item.type);
  if (!isRegisteredMissionType(type)) throw new Error(`Tipo de missão desconhecido: ${type}`);
  return { id: string(item.id), type, workspaceId: string(item.workspace_id), status: string(item.status, 'active') as MissionStatus, title: string(item.title), degraded: boolean(item.degraded), progress: number(item.progress), createdAt: string(item.created_at), updatedAt: string(item.updated_at) };
}
function contextPayload(value: MissionContext): JsonRecord {
  return {
    inputs: { ...value.inputs, project_ref: value.inputs.projectRef },
    answers: value.answers,
    decisions: value.decisions.map((item) => ({ id: item.id, step_id: item.stepId, field_id: item.fieldId, value: item.value, source: item.source, reason: item.reason, created_at: item.timestamp, impacts: item.impacts.map((impact) => ({ step_id: impact.stepId, field_ids: impact.fieldIds, reason: impact.reason })) })),
    rejections: value.rejections.map((item) => ({ id: item.id, suggestion_id: item.suggestionId, reason: item.reason, timestamp: item.timestamp })),
    gaps: value.gaps.map((item) => ({ id: item.id, title: item.title, description: item.description, severity: item.severity, related_step_id: item.relatedStepId, suggested_action: item.suggestedAction, status: item.status, dismiss_reason: item.dismissReason })),
    risks: value.risks.map((item) => ({ id: item.id, severity: item.severity, category: item.category, title: item.title, description: item.description, affected_steps: item.affectedSteps, suggested_action: item.suggestedAction, auto_detected: item.autoDetected, dismissed: item.dismissed })),
    inconsistencies: value.inconsistencies.map((item) => ({ id: item.id, title: item.title, description: item.description, affected_fields: item.affectedFields, suggested_fix: item.suggestedFix, blocking: item.blocking })),
    history: value.history, derived: value.derived,
  };
}
function journeyPayload(value: JourneyState): JsonRecord { return { current_step_id: value.currentStepId, progress: value.progress, steps: value.steps.map((step) => ({ definition_id: step.definitionId, status: step.status, completed_at: step.completedAt, validation_status: step.validationStatus, alerts: step.alerts })) }; }

export interface CreateMissionPayload { mission_type: string; title?: string; mode?: ExecutionMode; experience_level?: ExperienceLevel; workspace_id?: string | null; }
export interface AutosavePayload { title?: string; status?: MissionStatus; mode?: ExecutionMode; context?: MissionContext; journey?: JourneyState; version?: number; }
export interface FieldActionPayload { step_id: string; field_id: string; action_id: string; specialist?: SpecialistRole | null; interpolated_prompt: string; insert_mode: 'replace' | 'append' | 'suggest'; user_model_choice: string; use_user_key: true; }
export interface FieldActionResultDto { content: string; insert_mode: 'replace' | 'append' | 'suggest'; degraded: boolean; }
export interface GenerateArtifactsPayload { artifact_definitions: { type: string; title: string; can_feed_mission?: string[] }[]; step_titles: Record<string, string>; user_model_choice: string; use_user_key: true; }
export interface ArtifactsPreviewResultDto { drafts: ArtifactDraft[]; degraded: boolean; }

export const missionClient = {
  registry: async () => array(await request('/api/missions/registry', undefined, THIRTY_SEC)).map(record),
  list: async () => array(await request('/api/missions', undefined, THIRTY_SEC)).map(summary),
  get: async (id: string) => mission(await request(`/api/missions/${id}`, undefined, THIRTY_SEC)),
  create: async (payload: CreateMissionPayload) => mission(await request('/api/missions', { method: 'POST', body: JSON.stringify(payload) }, THIRTY_SEC)),
  autosave: async (id: string, payload: AutosavePayload) => mission(await request(`/api/missions/${id}`, { method: 'PATCH', body: JSON.stringify({ ...payload, context: payload.context ? contextPayload(payload.context) : undefined, journey: payload.journey ? journeyPayload(payload.journey) : undefined }) }, THIRTY_SEC)),
  executeFieldAction: async (id: string, payload: FieldActionPayload) => record(await request(`/api/missions/${id}/ai-action`, { method: 'POST', body: JSON.stringify(payload) }, FIVE_MIN)) as unknown as FieldActionResultDto,
  previewArtifacts: async (id: string, payload: GenerateArtifactsPayload): Promise<ArtifactsPreviewResultDto> => {
    const body = record(await request(`/api/missions/${id}/artifacts/preview`, { method: 'POST', body: JSON.stringify(payload) }, FIVE_MIN));
    return { drafts: array(body.drafts).map(artifactDraft), degraded: boolean(body.degraded) };
  },
  confirmArtifacts: async (id: string, artifacts: ArtifactDraft[]) => mission(await request(`/api/missions/${id}/artifacts/confirm`, { method: 'POST', body: JSON.stringify({ artifacts: artifacts.map(artifactDraftPayload) }) }, FIVE_MIN)),
  archive: async (id: string) => mission(await request(`/api/missions/${id}/archive`, { method: 'POST' }, THIRTY_SEC)),
  remove: async (id: string) => { await request(`/api/missions/${id}`, { method: 'DELETE' }, THIRTY_SEC); },
};
