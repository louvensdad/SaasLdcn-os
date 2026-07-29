import { API_BASE_URL } from '@/lib/api/endpoints';
import { apiRequest } from '@/lib/api/client';

export type LabModuleStatus = 'ready' | 'not_configured' | 'unsupported';

export interface EngineeringLabDependency {
  readonly name: string;
  readonly version?: string | null;
  readonly source: string;
}

export interface EngineeringLabFinding {
  readonly severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly line?: number | null;
}

export interface EngineeringLabSmell {
  readonly code: string;
  readonly message: string;
  readonly related_paths: readonly string[];
}

export interface EngineeringLabEndpoint {
  readonly method: string;
  readonly path: string;
  readonly source: string;
}

export interface EngineeringLabNode {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
}

export interface EngineeringLabEdge {
  readonly source: string;
  readonly target: string;
  readonly label: string;
}

export interface EngineeringLabModule {
  readonly id: string;
  readonly label: string;
  readonly status: LabModuleStatus;
  readonly summary: string;
  readonly evidence: readonly string[];
}

export interface EngineeringLabOverview {
  readonly contractVersion: string;
  readonly project_id: string;
  readonly project_path: string;
  readonly project_name: string;
  readonly stack: string;
  readonly primary_language: string;
  readonly languages: Record<string, number>;
  readonly file_count: number;
  readonly line_count: number;
  readonly dependency_count: number;
  readonly dependencies: readonly EngineeringLabDependency[];
  readonly containers: readonly string[];
  readonly databases: readonly string[];
  readonly cloud: readonly string[];
  readonly build: string;
  readonly coverage: string;
  readonly status: string;
  readonly health_score: number;
  readonly last_analysis: string;
  readonly diagnosis: {
    readonly detected_stack: string;
    readonly primary_language: string;
    readonly dependency_notes: readonly string[];
    readonly smells: readonly EngineeringLabSmell[];
    readonly security_findings: readonly EngineeringLabFinding[];
  };
  readonly api_endpoints: readonly EngineeringLabEndpoint[];
  readonly architecture_nodes: readonly EngineeringLabNode[];
  readonly architecture_edges: readonly EngineeringLabEdge[];
  readonly modules: readonly EngineeringLabModule[];
}

export interface EngineeringLabTerminalResponse {
  readonly project_id: string;
  readonly command: string;
  readonly cwd: string;
  readonly exit_code: number;
  readonly duration_ms: number;
  readonly output: readonly {
    readonly kind: 'stdout' | 'stderr';
    readonly text: string;
  }[];
}

function labUrl(projectId: string, suffix: string) {
  return `${API_BASE_URL}/api/engineering-lab/projects/${encodeURIComponent(projectId)}${suffix}`;
}

export const engineeringLabClient = {
  overview: (projectId: string) =>
    apiRequest<EngineeringLabOverview>(labUrl(projectId, '/overview')),
  runTerminal: (projectId: string, command: string, timeoutSeconds = 30) =>
    apiRequest<EngineeringLabTerminalResponse>(labUrl(projectId, '/terminal'), {
      method: 'POST',
      body: JSON.stringify({ command, timeout_seconds: timeoutSeconds }),
    }),
};
