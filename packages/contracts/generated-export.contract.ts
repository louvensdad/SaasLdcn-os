import type { GitProvider } from './git-provider.contract';

export type GeneratedProjectVisibility = 'private' | 'public' | 'internal';

export interface GeneratedProjectExportRequest {
  readonly namespace: string;
  readonly repo_name: string;
  readonly branch: string;
  readonly commit_message: string;
  readonly visibility: GeneratedProjectVisibility;
}

export interface GeneratedProjectExportResponse extends GeneratedProjectExportRequest {
  readonly provider: GitProvider;
  readonly status: string;
  readonly repo_url?: string | null;
  readonly file_count: number;
  readonly blocked: boolean;
  readonly message: string;
}
