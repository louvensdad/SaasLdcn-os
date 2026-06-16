export interface GeneratedEndpoint {
  readonly method: string;
  readonly path: string;
  readonly summary?: string | null;
  readonly operation_id?: string | null;
  readonly x_business_rule?: string | null;
}

export interface GeneratedEndpointsResponse {
  readonly project_id: string;
  readonly source_path: string;
  readonly endpoints: readonly GeneratedEndpoint[];
}

export interface ApiCollectionResponse {
  readonly project_id: string;
  readonly format: 'postman' | 'insomnia';
  readonly filename: string;
  readonly collection: Record<string, unknown>;
}
