import type { Evidence, GateEvidence, TestRoomSessionView } from '@contracts/test-room.contract';

import type { Family } from '@/components/signal';
import { GATE_FAMILY } from '@/lib/runtime/runtime-chain';
import { familyFor } from '@/lib/status';

/**
 * The Test Room page reads the sessions the backend stored for a generated project (`GET /api/test-room/{id}/sessions`),
 * newest first. A session records gates, and each gate the evidence it observed — a command with its exit code, an HTTP
 * probe with its status, a process, an artifact. It does not record a result per test, and it does not serve the output
 * the application printed; neither is drawn.
 */
export function newestFirst(sessions: readonly TestRoomSessionView[]): readonly TestRoomSessionView[] {
  return [...sessions].sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export function evidenceFamily(status: string): Family {
  return GATE_FAMILY[status] ?? familyFor(status);
}

/** `observed` and `failed` are results; `not_executed` and `unsupported` are steps that did not produce one. */
export function isResult(evidence: Evidence): boolean {
  return evidence.status === 'observed' || evidence.status === 'failed';
}

export interface RunStep {
  readonly key: string;
  readonly gate: GateEvidence;
  readonly evidence: Evidence;
  /** Where the step was observed, as a share of the span drawn (0 at the start of the session). */
  readonly at: number;
  readonly observedAt: number;
}

export interface RunSpan {
  readonly steps: readonly RunStep[];
  readonly start: number;
  /** The session's finish time, or the last observed step when the session recorded none. */
  readonly end: number;
  readonly finished: boolean;
}

/** Every piece of evidence placed at the time it was observed, between the start of the session and its end. */
export function runSpan(session: TestRoomSessionView): RunSpan | null {
  const start = Date.parse(session.started_at);
  if (Number.isNaN(start)) return null;
  const timed = session.gates.flatMap((gate) => gate.evidence.map((evidence, index) => ({
    key: `${gate.gate}:${evidence.id}:${index}`, gate, evidence, observedAt: Date.parse(evidence.observed_at),
  }))).filter((step) => !Number.isNaN(step.observedAt));
  if (timed.length === 0) return null;
  const finishedAt = session.finished_at ? Date.parse(session.finished_at) : Number.NaN;
  const finished = !Number.isNaN(finishedAt) && finishedAt > start;
  const lastSeen = Math.max(...timed.map((step) => step.observedAt));
  const end = finished ? Math.max(finishedAt, lastSeen) : lastSeen;
  const width = Math.max(1, end - start);
  const steps = timed
    .map((step) => ({ ...step, at: Math.min(1, Math.max(0, (step.observedAt - start) / width)) }))
    .sort((a, b) => a.observedAt - b.observedAt);
  return { steps, start, end, finished };
}

/** The Test Room of a project, optionally for a mission's project and a given session. */
export function testRoomHref(base: string, { mission, session }: { readonly mission?: string | null; readonly session?: string | null } = {}): string {
  const params = new URLSearchParams();
  if (mission) params.set('mission', mission);
  if (session) params.set('session', session);
  const query = params.toString();
  return `${base}/evidence/test-room${query ? `?${query}` : ''}`;
}
