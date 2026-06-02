import type { ContractMetadata } from './shared.contract';

export type InfrastructureCategory =
  | 'database'
  | 'cache'
  | 'queue'
  | 'object_storage'
  | 'auth_provider'
  | 'observability'
  | 'deployment'
  | 'containerization'
  | 'api_gateway'
  | 'search'
  | 'vector_database'
  | 'email_provider'
  | 'payment_provider';

export type InfrastructureProvider =
  | 'open_source'
  | 'self_hosted'
  | 'cloud_native'
  | 'aws'
  | 'cloudflare'
  | 'vercel'
  | 'railway'
  | 'flyio'
  | 'keycloak'
  | 'auth0'
  | 'clerk'
  | 'nextauth'
  | 'prometheus'
  | 'grafana'
  | 'opentelemetry'
  | 'sentry'
  | 'nginx'
  | 'spring_cloud'
  | 'kong'
  | 'traefik'
  | 'resend'
  | 'sendgrid'
  | 'stripe'
  | 'mercado_pago'
  | 'postgresql'
  | 'mysql'
  | 'mongodb'
  | 'redis'
  | 'rabbitmq'
  | 'kafka'
  | 'sqlite'
  | 'qdrant'
  | 'pinecone'
  | 'elasticsearch'
  | 'meilisearch'
  | 'docker'
  | 'kubernetes'
  | 'smtp'
  | 'local'
  | 'generic';

export interface InfrastructureComponent extends ContractMetadata {
  readonly id: string;
  readonly category: InfrastructureCategory;
  readonly name: string;
  readonly summary: string;
  readonly provider: InfrastructureProvider;
  readonly best_for: readonly string[];
  readonly avoid_when: readonly string[];
  readonly tradeoffs: readonly string[];
  readonly tags: readonly string[];
}

export interface InfrastructureCompatibilityRule extends ContractMetadata {
  readonly id: string;
  readonly component_id: string;
  readonly related_component_ids: readonly string[];
  readonly condition: string;
  readonly rationale: string;
  readonly severity: 'info' | 'warning' | 'critical';
}

export interface InfrastructureRecommendation extends ContractMetadata {
  readonly recommended: readonly string[];
  readonly required: readonly string[];
  readonly optional: readonly string[];
  readonly warnings: readonly string[];
  readonly rationale: readonly string[];
}

export interface InfrastructureProfile extends ContractMetadata {
  readonly architecture_level: string;
  readonly selected_component_ids: readonly string[];
  readonly recommended_component_ids: readonly string[];
  readonly required_component_ids: readonly string[];
  readonly optional_component_ids: readonly string[];
  readonly warnings: readonly string[];
  readonly rationale: readonly string[];
}
