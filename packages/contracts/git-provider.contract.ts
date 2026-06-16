import type { ContractMetadata, TimestampISO } from './shared.contract';

export type GitProvider = 'github' | 'gitlab';

export interface GitProviderConnection extends ContractMetadata {
  readonly provider: GitProvider;
  readonly status: 'connected' | 'disconnected';
  readonly username?: string | null;
  readonly avatar_url?: string | null;
  readonly namespaces: readonly string[];
  readonly repositories_count: number;
  readonly scopes: readonly string[];
  readonly permission: string;
  readonly last_sync?: TimestampISO | string | null;
}

export interface RepositoryCreateRequest {
  readonly provider: GitProvider;
  readonly namespace: string;
  readonly repo_name: string;
  readonly visibility: 'private' | 'public';
  readonly branch: string;
}

export interface RepositoryDelivery extends ContractMetadata, RepositoryCreateRequest {
  readonly status: 'created' | 'ready';
  readonly repo_url: string;
  readonly provider_id: string;
}
