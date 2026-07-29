/** Ambient, non-conversational operational status computed from persisted evidence. */
export type PresenceStatus = 'HEALTHY' | 'PROCESSING' | 'WARNING' | 'BLOCKED' | 'FAILED' | 'DEGRADED' | 'UNKNOWN';
export type PresenceSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type PresenceImportance = 'LOW' | 'NORMAL' | 'HIGH' | 'BLOCKING';
export interface SystemPresence { readonly status: PresenceStatus; readonly activity: string; readonly updated: string; }
export interface PresenceDecision { readonly id: string; readonly title: string; readonly category: string; readonly status: string; readonly severity: PresenceSeverity; readonly importance: PresenceImportance; readonly source: string; readonly correlationId: string; readonly projectId: string | null; readonly workspaceId: string | null; readonly evidenceRef: string | null; readonly occurredAt: string; readonly summary?: string | null; }
export interface PresenceDecisionResponse { readonly items: readonly PresenceDecision[]; readonly nextCursor: string | null; }