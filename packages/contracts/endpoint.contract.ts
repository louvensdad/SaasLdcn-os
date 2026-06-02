import type { ArchitectureId, ContractMetadata, FrameworkId } from './shared.contract';

export enum EndpointMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  PATCH = 'PATCH',
  DELETE = 'DELETE',
}

export enum EndpointSecurityLevel {
  PUBLIC = 'public',
  AUTHENTICATED = 'authenticated',
  PRIVILEGED = 'privileged',
  INTERNAL = 'internal',
}

export interface EndpointContract extends ContractMetadata {
  readonly id: string;
  readonly method: EndpointMethod;
  readonly path: string;
  readonly group: string;
  readonly description: string;
  readonly business_module_id?: string;
  readonly required_capabilities: readonly string[];
  readonly request_schema_hint: string;
  readonly response_schema_hint: string;
  readonly security_level: EndpointSecurityLevel;
  readonly supported_frameworks: readonly FrameworkId[];
  readonly supported_architectures: readonly ArchitectureId[];
}
