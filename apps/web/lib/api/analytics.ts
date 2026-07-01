import { apiRequest, ApiClientError } from '@/lib/api/client';
import { API_BASE_URL } from '@/lib/api/endpoints';

export interface AnalyticsMetric {
  readonly id: string;
  readonly label: string;
  readonly value: number | null;
  readonly unit?: string;
  readonly change?: number | null;
  readonly severity?: 'neutral' | 'positive' | 'warning' | 'critical';
  readonly drilldown_count?: number;
}

export interface AnalyticsSeriesPoint {
  readonly label: string;
  readonly value: number;
  readonly series?: string;
}

export interface AnalyticsRecord {
  readonly id: string;
  readonly [key: string]: unknown;
}

export interface AnalyticsSection {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly metrics?: readonly AnalyticsMetric[];
  readonly series?: readonly AnalyticsSeriesPoint[];
  readonly records?: readonly AnalyticsRecord[];
  readonly columns?: readonly string[];
}

export interface AnalyticsFilterOptions {
  readonly workspaces?: readonly string[];
  readonly project_types?: readonly string[];
  readonly providers?: readonly string[];
  readonly stacks?: readonly string[];
  readonly statuses?: readonly string[];
  readonly modules?: readonly string[];
  readonly severities?: readonly string[];
  readonly agents?: readonly string[];
  readonly languages?: readonly string[];
  readonly frameworks?: readonly string[];
}

export interface AnalyticsOverviewResponse {
  readonly generated_at: string;
  readonly period_start?: string;
  readonly period_end?: string;
  readonly metrics: readonly AnalyticsMetric[];
  readonly sections?: readonly AnalyticsSection[];
  readonly filters?: AnalyticsFilterOptions;
}

export interface AnalyticsFilters {
  readonly period: string;
  readonly workspace: string;
  readonly project_type: string;
  readonly provider: string;
  readonly stack: string;
  readonly status: string;
  readonly module: string;
  readonly severity: string;
  readonly agent: string;
  readonly language: string;
  readonly framework: string;
}

const SENSITIVE_KEY = /(?:api[_-]?key|access[_-]?token|refresh[_-]?token|secret|password|credential|authorization|prompt|raw[_-]?log)/i;

export function redactAnalyticsPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactAnalyticsPayload);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, child]) => [key, redactAnalyticsPayload(child)]),
  );
}

function buildAnalyticsQuery(filters: AnalyticsFilters): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && value !== 'all') params.set(key, value);
  });
  const query = params.toString();
  return query ? `?${query}` : '';
}

export async function getAnalyticsOverview(filters: AnalyticsFilters): Promise<AnalyticsOverviewResponse | null> {
  try {
    const payload = await apiRequest<unknown>(
      `${API_BASE_URL}/api/analytics/overview${buildAnalyticsQuery(filters)}`,
    );
    return redactAnalyticsPayload(payload) as AnalyticsOverviewResponse;
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) return null;
    throw error;
  }
}

